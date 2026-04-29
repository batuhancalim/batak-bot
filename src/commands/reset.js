const { SlashCommandBuilder } = require('discord.js');
const GameManager = require('../game/GameManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Kanalda devam eden bir oyun veya lobi varsa sıfırlar.'),
    async execute(interaction) {
        const channelId = interaction.channelId;
        const success = GameManager.resetGame(channelId);

        if (success) {
            await interaction.reply({ content: '✅ Bu kanaldaki oyun ve lobi başarıyla sıfırlandı. Yeni bir oyun başlatabilirsiniz!', ephemeral: false });
        } else {
            await interaction.reply({ content: '❌ Bu kanalda zaten aktif bir oyun veya lobi bulunmuyor.', ephemeral: true });
        }
    },
};
