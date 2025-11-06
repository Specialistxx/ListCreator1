// state/farms.js
const farms = new Map();
// key: farmMessageId (string)
// value: {
//   title, maxPlayers, duration, pingOnFinalize, hostId,
//   players: [{ id, name, mod }], // mod: 'M2' | 'M3'
//   privateChannelId, finalized: boolean, channelId: string
// }

module.exports = {
  farms
};
