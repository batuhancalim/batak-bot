require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();
const commandsArray = [];

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    } else {
        console.log(`[UYARI] ${filePath} komutunda 'data' veya 'execute' eksik.`);
    }
}

client.once('ready', async () => {
    console.log(`Bot aktif: ${client.user.tag}`);
    
    // Slash komutlarını kaydet
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('(/) Komutları güncelleniyor...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsArray },
        );
        console.log('(/) Komutları başarıyla yüklendi.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Bu komutu çalıştırırken bir hata oluştu!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Bu komutu çalıştırırken bir hata oluştu!', ephemeral: true });
            }
        }
    } else {
        // Buton veya Seçim Menüsü etkileşimleri GameManager'a yönlendirilecek
        const GameManager = require('./game/GameManager');
        try {
            await GameManager.handleInteraction(interaction);
        } catch (error) {
            console.error(error);
            // Hata mesajını oyuncuya gösterme, sadece logla (oyunu bozmamak için)
        }
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error("Lütfen .env dosyasında DISCORD_TOKEN tanımlayın.");
} else {
    client.login(process.env.DISCORD_TOKEN);
}
