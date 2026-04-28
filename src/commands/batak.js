const { SlashCommandBuilder } = require('discord.js');
const GameManager = require('../game/GameManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('batak')
        .setDescription('Yeni bir İhaleli Batak oyunu başlatır.')
        .addStringOption(option =>
            option.setName('mod')
                .setDescription('Oyun modu (Eşli veya Tekli)')
                .setRequired(true)
                .addChoices(
                    { name: 'Tekli', value: 'tekli' },
                    { name: 'Eşli', value: 'esli' }
                )
        ),
    async execute(interaction) {
        const mod = interaction.options.getString('mod');
        const channelId = interaction.channelId;

        if (GameManager.hasActiveGame(channelId)) {
            return interaction.reply({ content: 'Bu kanalda zaten aktif bir oyun veya bekleme salonu var!', ephemeral: true });
        }

        await GameManager.createLobby(interaction, mod);
    },
};
