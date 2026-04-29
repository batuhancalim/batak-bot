const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BatakGame = require('./BatakGame');

class GameManager {
    constructor() {
        this.games = new Map(); // channelId -> game instance
        this.lobbies = new Map(); // channelId -> lobby data
    }

    hasActiveGame(channelId) {
        return this.games.has(channelId) || this.lobbies.has(channelId);
    }

    async createLobby(interaction, mod) {
        const channelId = interaction.channelId;
        const hostId = interaction.user.id;

        const lobbyData = {
            host: hostId,
            mod: mod,
            players: [interaction.user],
            message: null
        };
        this.lobbies.set(channelId, lobbyData);

        const embed = this.getLobbyEmbed(lobbyData);
        const components = this.getLobbyComponents();

        await interaction.reply({ content: `**${mod === 'esli' ? 'Eşli' : 'Tekli'}** İhaleli Batak lobisi oluşturuluyor...`, ephemeral: true });
        const message = await interaction.channel.send({ embeds: [embed], components: [components] });
        lobbyData.message = message;
    }

    getLobbyEmbed(lobbyData) {
        let description = `Yeni bir oyun oluşturuldu! Katılmak için butona basın.\n\n**Oyuncular (${lobbyData.players.length}/4):**\n`;
        
        if (lobbyData.mod === 'esli') {
            // Eşli modda takımları göster
            description += `**Takım 1 (Kuzey-Güney):**\n`;
            description += `1. ${lobbyData.players[0] ? lobbyData.players[0].username : '...'}\n`;
            description += `3. ${lobbyData.players[2] ? lobbyData.players[2].username : '...'}\n\n`;
            description += `**Takım 2 (Doğu-Batı):**\n`;
            description += `2. ${lobbyData.players[1] ? lobbyData.players[1].username : '...'}\n`;
            description += `4. ${lobbyData.players[3] ? lobbyData.players[3].username : '...'}\n`;
        } else {
            lobbyData.players.forEach((p, i) => {
                description += `${i + 1}. ${p.username}\n`;
            });
        }

        return new EmbedBuilder()
            .setTitle(`İhaleli Batak (${lobbyData.mod === 'esli' ? 'Eşli' : 'Tekli'})`)
            .setColor(0x0099FF)
            .setDescription(description)
            .setFooter({ text: '4 kişi olduğunda oyun başlayacak.' });
    }

    getLobbyComponents() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_game')
                    .setLabel('Katıl / Ayrıl')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('start_early')
                    .setLabel('Hemen Başlat (Bot Doldurur)')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    async handleInteraction(interaction) {
        const channelId = interaction.channelId;

        // Lobi butonları
        if (this.lobbies.has(channelId)) {
            const lobbyData = this.lobbies.get(channelId);
            
            if (interaction.customId === 'join_game') {
                const playerIndex = lobbyData.players.findIndex(p => p.id === interaction.user.id);
                if (playerIndex > -1) {
                    lobbyData.players.splice(playerIndex, 1);
                    await interaction.reply({ content: 'Lobiden ayrıldınız.', ephemeral: true });
                } else {
                    if (lobbyData.players.length >= 4) {
                        return interaction.reply({ content: 'Lobi zaten dolu!', ephemeral: true });
                    }
                    lobbyData.players.push(interaction.user);
                    await interaction.reply({ content: 'Lobiye katıldınız!', ephemeral: true });
                }

                // Lobiyi güncelle
                await lobbyData.message.edit({ embeds: [this.getLobbyEmbed(lobbyData)], components: [this.getLobbyComponents()] });

                // 4 kişi olduysa oyunu başlat
                if (lobbyData.players.length === 4) {
                    await this.startGame(channelId);
                }
                return;
            }

            if (interaction.customId === 'start_early' && lobbyData.host === interaction.user.id) {
                await interaction.reply({ content: 'Oyun eksik oyuncular botlarla doldurularak başlatılıyor...', ephemeral: true });
                await this.startGame(channelId);
                return;
            } else if (interaction.customId === 'start_early') {
                 return interaction.reply({ content: 'Sadece lobiyi kuran kişi oyunu erken başlatabilir.', ephemeral: true });
            }
        }

        // Oyun içi butonlar
        if (this.games.has(channelId)) {
            const game = this.games.get(channelId);
            await game.handleInteraction(interaction);
        }
    }

    async startGame(channelId) {
        const lobbyData = this.lobbies.get(channelId);
        if (!lobbyData) return;

        this.lobbies.delete(channelId);
        
        // Eksik oyuncu varsa bot ekle (test için kolaylık)
        let botCount = 1;
        while(lobbyData.players.length < 4) {
            lobbyData.players.push({ id: `bot_${botCount}`, username: `Bot ${botCount}`, isBot: true });
            botCount++;
        }

        await lobbyData.message.edit({ components: [] }); // Lobi butonlarını kaldır

        const game = new BatakGame(lobbyData.message.channel, lobbyData.players, lobbyData.mod);
        this.games.set(channelId, game);
        
        await game.start();
    }

    resetGame(channelId) {
        const game = this.games.get(channelId);
        const hasLobby = this.lobbies.has(channelId);

        if (game || hasLobby) {
            if (game) game.destroy();
            this.games.delete(channelId);
            this.lobbies.delete(channelId);
            return true;
        }
        return false;
    }
}

module.exports = new GameManager();
