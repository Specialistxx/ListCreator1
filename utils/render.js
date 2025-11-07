const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

function farmEmbed(farm, createdBy) {
  const embed = new EmbedBuilder()
    .setColor(farm.finalized ? 0xff4d4d : 0x1abc9c)
    .setAuthor({
      name: 'ProTanki Farm Session',
      iconURL: 'https://cdn.discordapp.com/emojis/1219959270835167282.webp?size=96&quality=lossless',
    })
    .setTitle(`🌾 ${farm.title}`)
    .setDescription(
      `**👑 Host:** <@${farm.hostId}>\n` +
      `**👥 Players:** ${farm.players.length}/${farm.maxPlayers}\n` +
      `**⏱ Duration:** ${farm.duration} minutes\n` +
      `**📊 Status:** ${farm.finalized ? '🔒 Finalized (Locked)' : '🟢 Open for Join'}`
    )
    .setFooter({
      text: `Created by ${createdBy} • ProTanki Organizer`,
      iconURL: 'https://cdn.discordapp.com/emojis/1219959264647284736.webp?size=96&quality=lossless',
    })
    .setTimestamp();

  embed.addFields({
    name: '👤 Participants',
    value:
      farm.players.length > 0
        ? farm.players.map((p, i) => `${i + 1}. ${p.name}${p.mod ? ` — ${p.mod}` : ''}`).join('\n')
        : '_No players joined yet._',
  });

  return embed;
}

function farmButtons(farmMessageId, finalized) {
  const join = new ButtonBuilder()
    .setCustomId(`join:${farmMessageId}`)
    .setLabel('Join Farm')
    .setEmoji('🟢')
    .setStyle(ButtonStyle.Success)
    .setDisabled(finalized);

  const leave = new ButtonBuilder()
    .setCustomId(`leave:${farmMessageId}`)
    .setLabel('Leave Farm')
    .setEmoji('🔴')
    .setStyle(ButtonStyle.Secondary);

  const finalize = new ButtonBuilder()
    .setCustomId(`finalize:${farmMessageId}`)
    .setLabel(finalized ? 'Unfinalize' : 'Finalize')
    .setEmoji(finalized ? '🔓' : '🛑')
    .setStyle(finalized ? ButtonStyle.Secondary : ButtonStyle.Danger);

  const row1 = new ActionRowBuilder().addComponents(join, leave, finalize);

  const add = new ButtonBuilder()
    .setCustomId(`add:${farmMessageId}`)
    .setLabel('Add Player')
    .setEmoji('➕')
    .setStyle(ButtonStyle.Primary);

  const remove = new ButtonBuilder()
    .setCustomId(`remove:${farmMessageId}`)
    .setLabel('Remove Player')
    .setEmoji('➖')
    .setStyle(ButtonStyle.Secondary);

  const shuffle = new ButtonBuilder()
    .setCustomId(`shuffle:${farmMessageId}`)
    .setLabel('Gold List')
    .setEmoji('🔀')
    .setStyle(ButtonStyle.Primary);

  const split = new ButtonBuilder()
    .setCustomId(`split:${farmMessageId}`)
    .setLabel('Split Teams')
    .setEmoji('⚖️')
    .setStyle(ButtonStyle.Secondary);

  const pingAll = new ButtonBuilder()
    .setCustomId(`ping:${farmMessageId}`)
    .setLabel('Ping Everyone')
    .setEmoji('📣')
    .setStyle(ButtonStyle.Primary);

  const endFarm = new ButtonBuilder()
    .setCustomId(`end:${farmMessageId}`)
    .setLabel('End Farm')
    .setEmoji('🧹')
    .setStyle(ButtonStyle.Danger);

  const row2 = new ActionRowBuilder().addComponents(add, remove, shuffle, split, pingAll);
  const row3 = new ActionRowBuilder().addComponents(endFarm);

  return [row1, row2, row3];
}

function modChoiceRow(farmMessageId, payload) {
  const suffix = payload ? `${payload}` : `${farmMessageId}`;
  const m2 = new ButtonBuilder()
    .setCustomId(`mod_m2:${suffix}`)
    .setLabel('Freeze M2')
    .setEmoji('❄️')
    .setStyle(ButtonStyle.Primary);
  const m3 = new ButtonBuilder()
    .setCustomId(`mod_m3:${suffix}`)
    .setLabel('Freeze M3')
    .setEmoji('⚡')
    .setStyle(ButtonStyle.Secondary);
  return [new ActionRowBuilder().addComponents(m2, m3)];
}

module.exports = { farmEmbed, farmButtons, modChoiceRow };
