const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { farms } = require('../state/farms');
const { farmEmbed, farmButtons, modChoiceRow } = require('../utils/render');

// ===== Helpers =====
function isAdmin(member) {
  const hasPerm = member.permissions.has(PermissionFlagsBits.ManageChannels);
  const hasOrganizerRole = member.roles.cache.some(
    r => r.name.toLowerCase() === 'farm organizer' || r.name.toLowerCase() === 'farm organiser'
  );
  return hasPerm || hasOrganizerRole;
}

function shuffleArray(arr) {
  return arr.map(x => ({ sort: Math.random(), value: x }))
    .sort((a, b) => a.sort - b.sort)
    .map(x => x.value);
}

function splitTeams(players) {
  const m2 = players.filter(p => p.mod === 'M2');
  const m3 = players.filter(p => p.mod === 'M3');
  const blue = [], red = [];
  m2.forEach((p, i) => (i % 2 === 0 ? blue : red).push(p));
  shuffleArray(m3).forEach(p => (blue.length <= red.length ? blue : red).push(p));
  return { blue, red };
}

async function updateFarmMessage(interaction, farm, farmMessageId) {
  const farmMessage = await interaction.channel.messages.fetch(farmMessageId).catch(() => null);
  if (!farmMessage) return;
  await farmMessage.edit({
    embeds: [farmEmbed(farm, interaction.member.user.tag)],
    components: farmButtons(farmMessageId, farm.finalized)
  });
}

function findMemberByNameCached(guild, name) {
  const clean = name.replace(/[<@!>]/g, '').trim().toLowerCase();
  return guild.members.cache.find(
    m => m.displayName.toLowerCase() === clean || m.user.username.toLowerCase() === clean || m.id === clean
  ) || null;
}

async function fetchMemberByIdSafe(guild, id) {
  try { return await guild.members.fetch(id); } catch { return null; }
}

async function removeRoleIfHas(guild, roleId, player) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return;
  let member = null;
  if (player?.id) {
    member = guild.members.cache.get(player.id) || await fetchMemberByIdSafe(guild, player.id);
  } else if (player?.name) {
    member = findMemberByNameCached(guild, player.name);
  }
  if (member && member.roles.cache.has(role.id)) {
    await member.roles.remove(role).catch(() => {});
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try { await command.execute(interaction); }
      catch (e) {
        console.error(e);
        if (!interaction.replied) {
          await interaction.reply({ content: '⚠️ Error executing command.', ephemeral: true });
        }
      }
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const partsRaw = interaction.customId.split(':');
      const action = partsRaw[0];
      const farmMessageId = partsRaw[1] === 'manual' ? partsRaw[2] : partsRaw[1];
      const farm = farms.get(farmMessageId);

      if (!farm) {
        return interaction.reply({ content: '⚠️ This farm is no longer active.', ephemeral: true });
      }

      const farmMessage = await interaction.channel.messages.fetch(farmMessageId).catch(() => null);
      if (!farmMessage) {
        return interaction.reply({ content: '⚠️ Cannot find farm message.', ephemeral: true });
      }

      const userInFarm = farm.players.some(p => p.id === interaction.user.id);
      const isHostOrAdmin = interaction.user.id === farm.hostId || isAdmin(interaction.member);

      // JOIN
      if (action === 'join') {
        if (farm.finalized) return interaction.reply({ content: '🚫 Farm is finalized.', ephemeral: true });
        if (userInFarm)   return interaction.reply({ content: 'ℹ️ You are already in this farm.', ephemeral: true });
        if (farm.players.length >= farm.maxPlayers)
          return interaction.reply({ content: '🚫 Farm is already full.', ephemeral: true });
        return interaction.reply({
          content: 'Please select your Freeze modification level:',
          components: modChoiceRow(farmMessageId),
          ephemeral: true
        });
      }

      // LEAVE
      if (action === 'leave') {
        if (!userInFarm) return interaction.reply({ content: 'ℹ️ You are not in this farm.', ephemeral: true });
        const player = farm.players.find(p => p.id === interaction.user.id);
        farm.players = farm.players.filter(p => p.id !== interaction.user.id);

        await removeRoleIfHas(interaction.guild, farm.roleId, player);

        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (privateChannel) {
          await privateChannel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: false }).catch(() => {});
        }
        if (farm.finalized && farm.players.length < farm.maxPlayers) farm.finalized = false;

        await updateFarmMessage(interaction, farm, farmMessageId);
        return interaction.reply({ content: '✅ You left the farm.', ephemeral: true });
      }

      // ADD
      if (action === 'add') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`modalAdd:${farmMessageId}`).setTitle('➕ Add Player');
        const input = new TextInputBuilder()
          .setCustomId('playerName').setLabel('Enter player name (nickname or username)')
          .setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // REMOVE
      if (action === 'remove') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        if (farm.players.length === 0)
          return interaction.reply({ content: '⚠️ No players to remove.', ephemeral: true });

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`removeSelect:${farmMessageId}`)
          .setPlaceholder('Select a player to remove')
          .addOptions(farm.players.map((p, idx) => ({
            label: p.name,
            value: p.id || `name::${p.name}`    // stable value
          })));
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: 'Select a player to remove:', components: [row], ephemeral: true });
      }

      // SHUFFLE
      if (action === 'shuffle') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (!privateChannel) return interaction.reply({ content: '⚠️ Private channel missing.', ephemeral: true });
        const shuffled = shuffleArray([...farm.players]);
        const lines = shuffled.map((p, i) => `${i + 1}. ${p.name}`);
        await privateChannel.send(`🎲 **Randomized Gold List**\n${lines.join('\n')}`);
        return interaction.reply({ content: '✅ Shuffled list sent privately.', ephemeral: true });
      }

      // SPLIT
      if (action === 'split') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (!privateChannel) return interaction.reply({ content: '⚠️ Private channel missing.', ephemeral: true });
        const { blue, red } = splitTeams(farm.players);
        await privateChannel.send(
          `🟦 **Blue Team**\n${(blue.map(p => `• ${p.name}`).join('\n') || '_empty_')}\n\n` +
          `🟥 **Red Team**\n${(red.map(p => `• ${p.name}`).join('\n') || '_empty_')}`
        );
        return interaction.reply({ content: '✅ Teams split posted in the private channel.', ephemeral: true });
      }

      // FINALIZE
      if (action === 'finalize') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        if (farm.finalized)   return interaction.reply({ content: 'ℹ️ Already finalized.', ephemeral: true });
        farm.finalized = true;
        await updateFarmMessage(interaction, farm, farmMessageId);
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (privateChannel && farm.pingOnFinalize) {
          const mentions = farm.players.filter(p => p.id).map(p => `<@${p.id}>`).join(', ');
          await privateChannel.send({ content: `✅ **Farm Finalized! Ready to Start!** ${mentions}`, allowedMentions: { parse: ['users'] } });
        }
        return interaction.reply({ content: '✅ Farm locked and ready!', ephemeral: true });
      }

      // END
      if (action === 'end') {
        if (!isHostOrAdmin) return interaction.reply({ content: '🚫 Admins/Host only.', ephemeral: true });
        const confirm = new ButtonBuilder().setCustomId(`confirmEnd:${farmMessageId}`).setLabel('✅ Confirm End').setStyle(ButtonStyle.Danger);
        const cancel  = new ButtonBuilder().setCustomId(`cancelEnd:${farmMessageId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(confirm, cancel);
        await interaction.reply({ content: '⚠️ End farm? This deletes the private channel and the role.', components: [row], ephemeral: true });
        return;
      }

      // CONFIRM END
      if (action === 'confirmEnd') {
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        const role = interaction.guild.roles.cache.get(farm.roleId);
        if (privateChannel) await privateChannel.delete().catch(() => {});
        if (role)           await role.delete().catch(() => {});
        farms.delete(farmMessageId);
        const endedEmbed = new EmbedBuilder()
          .setTitle(`💀 ${farm.title} (Ended)`)
          .setDescription('The farm has ended. Channel & role deleted.')
          .setColor(0x9b1c31);
        await farmMessage.edit({ embeds: [endedEmbed], components: [] });
        return interaction.update({ content: '✅ Farm ended.', components: [] });
      }

      if (action === 'cancelEnd') {
        return interaction.update({ content: '❌ Farm end canceled.', components: [] });
      }
    }

    // Modal submit: Add Player
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modalAdd:')) {
      const [, farmMessageId] = interaction.customId.split(':');
      const farm = farms.get(farmMessageId);
      if (!farm) return interaction.reply({ content: '⚠️ Farm not found.', ephemeral: true });

      const inputName = interaction.fields.getTextInputValue('playerName').trim();
      if (!inputName) return interaction.reply({ content: '⚠️ Invalid name.', ephemeral: true });

      const member = findMemberByNameCached(interaction.guild, inputName);
      const newPlayer = member
        ? { id: member.id, name: member.displayName, mod: null }
        : { id: null, name: inputName, mod: null };

      farm.players.push(newPlayer);

      if (member) {
        const role = interaction.guild.roles.cache.get(farm.roleId);
        if (role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
        const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
        if (privateChannel) {
          await privateChannel.permissionOverwrites.create(member.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true
          }).catch(() => {});
        }
      }

      await updateFarmMessage(interaction, farm, farmMessageId);

      // Show manual M2/M3 chooser (customId encodes manual flow!)
      return interaction.reply({
        content: `Player **${inputName}** added. Select their Freeze modification:`,
        components: modChoiceRow(farmMessageId, `manual:${farmMessageId}:${inputName}`), // 👈 custom payload
        ephemeral: true
      });
    }

    // Remove select
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('removeSelect:')) {
      const [, farmMessageId] = interaction.customId.split(':');
      const farm = farms.get(farmMessageId);
      if (!farm) return interaction.reply({ content: '⚠️ Farm not found.', ephemeral: true });

      const selected = interaction.values[0];
      const player = selected.startsWith('name::')
        ? farm.players.find(p => `name::${p.name}` === selected)
        : farm.players.find(p => p.id === selected);

      if (!player) return interaction.reply({ content: '⚠️ Player not found.', ephemeral: true });

      farm.players = farm.players.filter(p => p !== player);
      await removeRoleIfHas(interaction.guild, farm.roleId, player);

      if (farm.finalized && farm.players.length < farm.maxPlayers) farm.finalized = false;

      await updateFarmMessage(interaction, farm, farmMessageId);
      return interaction.reply({ content: `❌ Removed **${player.name}**.`, ephemeral: true });
    }

    // M2/M3 (normal & manual)
    if (interaction.isButton() &&
        (interaction.customId.startsWith('mod_m2:') || interaction.customId.startsWith('mod_m3:'))) {

      const parts = interaction.customId.split(':');
      const mod = parts[0] === 'mod_m2' ? 'M2' : 'M3';

      // manual flow format: mod_mX:manual:<farmId>:<playerName with colons allowed>
      if (parts[1] === 'manual') {
        const farmMessageId = parts[2];
        const farm = farms.get(farmMessageId);
        if (!farm) return interaction.reply({ content: '⚠️ Farm not found.', ephemeral: true });
        const playerName = parts.slice(3).join(':');
        const player = farm.players.find(p => p.name === playerName);
        if (player) player.mod = mod;
        await updateFarmMessage(interaction, farm, farmMessageId);
        return interaction.update({ content: `✅ Player **${playerName}** set as **${mod}**.`, components: [] });
      }

      // normal join flow: mod_mX:<farmId>
      const farmMessageId = parts[1];
      const farm = farms.get(farmMessageId);
      if (!farm) return interaction.reply({ content: '⚠️ Farm not found.', ephemeral: true });
      if (farm.finalized) return interaction.reply({ content: '🚫 Farm finalized.', ephemeral: true });
      if (farm.players.length >= farm.maxPlayers) return interaction.reply({ content: '🚫 Farm full.', ephemeral: true });

      const member = interaction.member;
      farm.players.push({ id: member.id, name: member.displayName, mod });

      const role = interaction.guild.roles.cache.get(farm.roleId);
      if (role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
      const privateChannel = interaction.guild.channels.cache.get(farm.privateChannelId);
      if (privateChannel) {
        await privateChannel.permissionOverwrites.create(member.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true
        }).catch(() => {});
      }

      await updateFarmMessage(interaction, farm, farmMessageId);

      if (farm.players.length >= farm.maxPlayers) {
        farm.finalized = true;
        await updateFarmMessage(interaction, farm, farmMessageId);
      }

      return interaction.reply({ content: `✅ Joined as ${mod}.`, ephemeral: true });
    }
  }
};
