const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { farms } = require('../state/farms');
const { farmEmbed, farmButtons } = require('../utils/render');

// ===== Helpers =====
function isAdmin(member) {
  const hasPerm = member.permissions.has(PermissionFlagsBits.ManageChannels);
  const hasOrganizerRole = member.roles.cache.some(
    r => r.name.toLowerCase() === 'farm organizer' || r.name.toLowerCase() === 'farm organiser'
  );
  return hasPerm || hasOrganizerRole;
}

async function updateFarmMessage(interaction, farm, farmMessageId) {
  const farmMessage = await interaction.channel.messages.fetch(farmMessageId).catch(() => null);
  if (!farmMessage) return;
  await farmMessage.edit({
    embeds: [farmEmbed(farm, interaction.member.user.tag)],
    components: farmButtons(farmMessageId, farm.finalized)
  });
}

async function fetchMemberByIdSafe(guild, id) {
  try {
    return await guild.members.fetch(id);
  } catch {
    return null;
  }
}

async function findMemberByNameOrMention(guild, input) {
  const clean = input.replace(/[<@!>]/g, '').trim().toLowerCase();
  return (
    guild.members.cache.find(
      m =>
        m.user.username.toLowerCase() === clean ||
        m.displayName.toLowerCase() === clean ||
        m.id === clean
    ) || null
  );
}

async function giveFarmRoleIfExists(guild, roleId, player) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return;
  const member = await fetchMemberByIdSafe(guild, player.id);
  if (member && !member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch(() => {});
  }
}

async function removeFarmRoleIfHas(guild, roleId, player) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return;
  const member = await fetchMemberByIdSafe(guild, player.id);
  if (member && member.roles.cache.has(role.id)) {
    await member.roles.remove(role).catch(() => {});
  }
}

// ===== MAIN HANDLER =====
module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (e) {
        console.error(e);
        if (!interaction.replied)
          await interaction.reply({ content: '⚠️ Error executing command.', ephemeral: true });
      }
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const partsRaw = interaction.customId.split(':');
      const action = partsRaw[0];
      const farmMessageId = partsRaw[1] === 'manual' ? partsRaw[2] : partsRaw[1];
      const farm = farms.get(farmMessageId);
      if (!farm)
        return interaction.reply({ content: '⚠️ This farm is no longer active.', ephemeral: true });

      const farmMessage = await interaction.channel.messages.fetch(farmMessageId).catch(() => null);
      if (!farmMessage)
        return interaction.reply({ content: '⚠️ Cannot find farm message.', ephemeral: true });

      const userInFarm = farm.players.some(p => p.id === interaction.user.id);
      const isHostOrAdmin = interaction.user.id === farm.hostId || isAdmin(interaction.member);

      // JOIN
      if (action === 'join') {
        if (farm.finalized)
          return interaction.reply({ content: '🚫 Farm is finalized.', ephemeral: true });
        if (userInFarm)
          return interaction.reply({ content: 'ℹ️ You are already in this farm.', ephemeral: true });
        if (farm.players.length >= farm.maxPlayers)
          return interaction.reply({ content: '🚫 Farm is already full.', ephemeral: true });

        return interaction.reply({
          content: 'Please select your Freeze modification level:',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`mod_m2:${farmMessageId}`)
                .setLabel('Freeze M2')
                .setEmoji('❄️')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`mod_m3:${farmMessageId}`)
                .setLabel('Freeze M3')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Secondary)
            )
          ],
          ephemeral: true
        });
      }

      // MOD M2 / M3
      if (action === 'mod_m2' || action === 'mod_m3') {
        const mod = action === 'mod_m2' ? 'M2' : 'M3';
        if (farm.players.some(p => p.id === interaction.user.id))
          return interaction.reply({ content: '⚠️ You have already joined this farm.', ephemeral: true });

        const player = { id: interaction.user.id, name: interaction.user.username, mod };
        farm.players.push(player);

        await giveFarmRoleIfExists(interaction.guild, farm.roleId, player);
        await updateFarmMessage(interaction, farm, farmMessageId);

        return interaction.reply({
          content: `✅ You have successfully joined the farm as **${mod}**!`,
          ephemeral: true
        });
      }

      // LEAVE FARM
      if (action === 'leave') {
        if (!userInFarm)
          return interaction.reply({ content: '⚠️ You are not part of this farm.', ephemeral: true });

        const player = farm.players.find(p => p.id === interaction.user.id);
        await removeFarmRoleIfHas(interaction.guild, farm.roleId, player);

        farm.players = farm.players.filter(p => p.id !== interaction.user.id);
        await updateFarmMessage(interaction, farm, farmMessageId);

        return interaction.reply({ content: '👋 You have left the farm successfully.', ephemeral: true });
      }

      // FINALIZE / UNFINALIZE
      if (action === 'finalize') {
        if (!isHostOrAdmin)
          return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });

        farm.finalized = !farm.finalized;
        await updateFarmMessage(interaction, farm, farmMessageId);

        const msg = farm.finalized
          ? '✅ Farm finalized and locked for joining.'
          : '🔓 Farm reopened — players can join again.';
        return interaction.reply({ content: msg, ephemeral: true });
      }

      // ADD PLAYER MANUAL
      if (action === 'add') {
        if (!isHostOrAdmin)
          return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`addPlayerModal:${farmMessageId}`)
          .setTitle('Add Player Manually');

        const nameInput = new TextInputBuilder()
          .setCustomId('playerName')
          .setLabel('Enter player name or mention')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        return interaction.showModal(modal);
      }

      // REMOVE PLAYER MANUAL
      if (action === 'remove') {
        if (!isHostOrAdmin)
          return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`removePlayerModal:${farmMessageId}`)
          .setTitle('Remove Player');

        const nameInput = new TextInputBuilder()
          .setCustomId('playerName')
          .setLabel('Enter player name or mention')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        return interaction.showModal(modal);
      }

      // PING PLAYERS
      if (action === 'ping') {
        if (!isHostOrAdmin)
          return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });

        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (!privateChannel)
          return interaction.reply({ content: '⚠️ Private channel missing.', ephemeral: true });

        const mentions = farm.players.map(p => (p.id ? `<@${p.id}>` : p.name)).filter(Boolean);
        if (!mentions.length)
          return interaction.reply({ content: '⚠️ No players to ping.', ephemeral: true });

        try {
          const batchSize = 10;
          for (let i = 0; i < mentions.length; i += batchSize) {
            const batch = mentions.slice(i, i + batchSize);
            await privateChannel.send(`📣 **Ping:** ${batch.join(' ')}\n**Farm:** ${farm.title}`);
            await new Promise(r => setTimeout(r, 1500));
          }
          return interaction.reply({ content: '✅ All players have been pinged.', ephemeral: true });
        } catch {
          return interaction.reply({ content: '⚠️ Failed to send pings.', ephemeral: true });
        }
      }

      // END FARM
      if (action === 'end') {
        if (!isHostOrAdmin)
          return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });

        const confirm = new ButtonBuilder()
          .setCustomId(`confirmEnd:${farmMessageId}`)
          .setLabel('✅ Confirm End')
          .setStyle(ButtonStyle.Danger);
        const cancel = new ButtonBuilder()
          .setCustomId(`cancelEnd:${farmMessageId}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(confirm, cancel);

        await interaction.reply({
          content: '⚠️ End farm? This deletes the private channel and the role.',
          components: [row],
          ephemeral: true
        });
        return;
      }

      // CONFIRM END
      if (action === 'confirmEnd') {
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        const role = interaction.guild.roles.cache.get(farm.roleId);
        if (role) {
          for (const player of farm.players)
            await removeFarmRoleIfHas(interaction.guild, role.id, player);
        }
        if (privateChannel) await privateChannel.delete().catch(() => {});
        if (role) await role.delete().catch(() => {});
        farms.delete(farmMessageId);

        const endedEmbed = new EmbedBuilder()
          .setTitle(`💀 ${farm.title} (Ended)`)
          .setDescription('The farm has ended. Channel & role deleted.')
          .setColor(0x9b1c31);
        await farmMessage.edit({ embeds: [endedEmbed], components: [] });
        return interaction.update({ content: '✅ Farm ended.', components: [] });
      }
    }

    // MODALS
    if (interaction.isModalSubmit()) {
      const [type, farmMessageId] = interaction.customId.split(':');
      const farm = farms.get(farmMessageId);
      if (!farm)
        return interaction.reply({ content: '⚠️ Farm not found.', ephemeral: true });

      // ADD PLAYER
      if (type === 'addPlayerModal') {
        const playerName = interaction.fields.getTextInputValue('playerName').trim();
        if (farm.players.some(p => p.name.toLowerCase() === playerName.toLowerCase()))
          return interaction.reply({ content: '⚠️ Player already added.', ephemeral: true });

        const foundMember = await findMemberByNameOrMention(interaction.guild, playerName);
        const player = foundMember
          ? { id: foundMember.id, name: foundMember.user.username }
          : { name: playerName };

        farm.players.push(player);
        await giveFarmRoleIfExists(interaction.guild, farm.roleId, player);
        await updateFarmMessage(interaction, farm, farmMessageId);

        return interaction.reply({ content: `✅ Added **${playerName}** to the farm.`, ephemeral: true });
      }

      // REMOVE PLAYER
      if (type === 'removePlayerModal') {
        const playerName = interaction.fields.getTextInputValue('playerName').trim();
        const index = farm.players.findIndex(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (index === -1)
          return interaction.reply({ content: '⚠️ Player not found in farm.', ephemeral: true });

        const player = farm.players[index];
        await removeFarmRoleIfHas(interaction.guild, farm.roleId, player);
        farm.players.splice(index, 1);

        await updateFarmMessage(interaction, farm, farmMessageId);
        return interaction.reply({ content: `✅ Removed **${playerName}** from the farm.`, ephemeral: true });
      }
    }
  }
};
