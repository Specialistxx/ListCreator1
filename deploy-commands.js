require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🌀 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands('1435945120766890044'),
      { body: commands },
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();
