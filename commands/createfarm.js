const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { farms } = require('../state/farms');
const { farmEmbed, farmButtons } = require('../utils/render');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createfarm')
    .setDescription('Create a new ProTanki farm session.')
    .addStringOption(o =>
      o.setName('title')
        .setDescription('Farm title (used for role & channel name)')
        .setRequired(true))
    .addIntegerOption(o =>
      o.setName('max_players')
        .setDescription('Maximum number of players allowed')
        .setRequired(true))
    .addIntegerOption(o =>
      o.setName('duration')
        .setDescription('Duration in minutes (for display only)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    // ✅ Defer reply privately while setting up
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title');
    const maxPlayers = interaction.options.getInteger('max_players');
    const duration = interaction.options.getInteger('duration');

    // 🔍 Find “Active Farms” category
    const category = interaction.guild.channels.cache.find(
      c => c.type === 4 && c.name.toLowerCase().includes('active farms')
    );

    if (!category) {
      return interaction.followUp({
        content: '⚠️ Could not find a category named **Active Farms**. Please create it first.',
        ephemeral: true
      });
    }

    // 🧱 Create temporary role for this farm
    const roleName = `Farm - ${title}`;
    let farmRole;
    try {
      farmRole = await interaction.guild.roles.create({
        name: roleName,
        mentionable: false,
        reason: `Temporary farm role for ${title}`
      });
    } catch (err) {
      console.error('❌ Role creation failed:', err);
      return interaction.followUp({
        content: '⚠️ Missing permission to create roles. Please give the bot “Manage Roles.”',
        ephemeral: true
      });
    }

    // 📦 Create private channel under that category
    const cleanName = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

    let privateChannel;
    try {
      privateChannel = await interaction.guild.channels.create({
        name: cleanName,
        type: 0, // text channel
        parent: category.id,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          { id: farmRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          { id: interaction.client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels'] }
        ]
      });
    } catch (err) {
      console.error('❌ Channel creation failed:', err);
      return interaction.followUp({
        content: '⚠️ Missing permission to create channels. Please give the bot “Manage Channels.”',
        ephemeral: true
      });
    }

    // 💾 Build temporary farm object
    const tempFarm = {
      title,
      maxPlayers,
      duration,
      hostId: interaction.user.id,
      players: [],
      privateChannelId: privateChannel.id,
      roleId: farmRole.id,
      finalized: false,
      channelId: interaction.channel.id
    };

    // 📨 Send farm embed PUBLICLY in the current channel
    const farmMessage = await interaction.channel.send({
      content: `🆕 **${title}** created by <@${interaction.user.id}>.\nPrivate room: <#${privateChannel.id}>`,
      embeds: [farmEmbed(tempFarm, interaction.user.tag)],
      components: farmButtons('TEMP', false)
    });

    // Save the farm with real message id
    farms.set(farmMessage.id, { ...tempFarm });

    // Update the buttons to contain message id
    await farmMessage.edit({
      components: farmButtons(farmMessage.id, false)
    });

    // 👍 Acknowledge setup privately
    await interaction.followUp({
      content: `✅ Farm **${title}** created successfully!`,
      ephemeral: true
    });

    // 🙌 Welcome message in the farm’s private channel
    await privateChannel.send(
      `🎯 **Welcome to ${title}!**\n` +
      `Players who join this farm will automatically get the role **${farmRole.name}** and gain access here.\n` +
      `⏱️ Duration: **${duration} minutes** _(for reference only; does not auto-delete)._`
    );
  }
};
