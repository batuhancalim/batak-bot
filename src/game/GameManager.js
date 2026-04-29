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
            players: [null, null, null, null], // [Güney, Doğu, Kuzey, Batı]
            message: null
        };
        // Kurucuyu otomatik olarak 1. Takım'a (Güney - 0. index) yerleştir
        lobbyData.players[0] = interaction.user;
        this.lobbies.set(channelId, lobbyData);

        const embed = this.getLobbyEmbed(lobbyData);
        const components = this.getLobbyComponents(mod);

        await interaction.reply({ content: `**${mod === 'esli' ? 'Eşli' : 'Tekli'}** İhaleli Batak lobisi oluşturuluyor...`, ephemeral: true });
        const message = await interaction.channel.send({ embeds: [embed], components: [components] });
        lobbyData.message = message;
    }

    getLobbyEmbed(lobbyData) {
        let description = `Yeni bir oyun oluşturuldu! Katılmak istediğiniz takımı/koltuğu seçin.\n\n`;
        
        if (lobbyData.mod === 'esli') {
            description += `🏠 **Takım 1 (Kuzey-Güney):**\n`;
            description += `• Kuzey: ${lobbyData.players[2] ? `**${lobbyData.players[2].username}**` : '_Boş_'}\n`;
            description += `• Güney: ${lobbyData.players[0] ? `**${lobbyData.players[0].username}**` : '_Boş_'}\n\n`;
            
            description += `🏢 **Takım 2 (Doğu-Batı):**\n`;
            description += `• Doğu: ${lobbyData.players[1] ? `**${lobbyData.players[1].username}**` : '_Boş_'}\n`;
            description += `• Batı: ${lobbyData.players[3] ? `**${lobbyData.players[3].username}**` : '_Boş_'}\n`;
        } else {
            description += `**Oyuncular:**\n`;
            lobbyData.players.forEach((p, i) => {
                const yonler = ['Güney', 'Doğu', 'Kuzey', 'Batı'];
                description += `${i + 1}. ${yonler[i]}: ${p ? `**${p.username}**` : '_Boş_'}\n`;
            });
        }

        return new EmbedBuilder()
            .setTitle(`İhaleli Batak (${lobbyData.mod === 'esli' ? 'Eşli' : 'Tekli'})`)
            .setColor(0x0099FF)
            .setDescription(description)
            .setFooter({ text: 'Tüm koltuklar dolduğunda veya kurucu başlattığında oyun başlar.' });
    }

    getLobbyComponents(mod) {
        const row = new ActionRowBuilder();
        
        if (mod === 'esli') {
            row.addComponents(
                new ButtonBuilder().setCustomId('join_team_1').setLabel('Takım 1\'e Katıl (K-G)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('join_team_2').setLabel('Takım 2\'ye Katıl (D-B)').setStyle(ButtonStyle.Success)
            );
        } else {
            row.addComponents(
                new ButtonBuilder().setCustomId('join_any').setLabel('Koltuk Seç / Katıl').setStyle(ButtonStyle.Primary)
            );
        }

        row.addComponents(
            new ButtonBuilder().setCustomId('leave_lobby').setLabel('Ayrıl').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('start_early').setLabel('Botlarla Başlat').setStyle(ButtonStyle.Secondary)
        );
        
        return row;
    }

    async handleInteraction(interaction) {
        const channelId = interaction.channelId;
        if (!this.lobbies.has(channelId)) {
             if (this.games.has(channelId)) {
                await this.games.get(channelId).handleInteraction(interaction);
             }
             return;
        }

        const lobbyData = this.lobbies.get(channelId);
        const userId = interaction.user.id;

        if (interaction.customId === 'join_team_1' || interaction.customId === 'join_team_2' || interaction.customId === 'join_any') {
            // Önce varsa eski yerinden çıkar
            const oldIndex = lobbyData.players.findIndex(p => p && p.id === userId);
            if (oldIndex !== -1) lobbyData.players[oldIndex] = null;

            let success = false;
            if (interaction.customId === 'join_team_1') {
                if (!lobbyData.players[0]) { lobbyData.players[0] = interaction.user; success = true; }
                else if (!lobbyData.players[2]) { lobbyData.players[2] = interaction.user; success = true; }
            } else if (interaction.customId === 'join_team_2') {
                if (!lobbyData.players[1]) { lobbyData.players[1] = interaction.user; success = true; }
                else if (!lobbyData.players[3]) { lobbyData.players[3] = interaction.user; success = true; }
            } else {
                const emptyIdx = lobbyData.players.findIndex(p => p === null);
                if (emptyIdx !== -1) { lobbyData.players[emptyIdx] = interaction.user; success = true; }
            }

            if (!success) return interaction.reply({ content: 'Seçtiğiniz takım veya lobi dolu!', ephemeral: true });
            
            await interaction.reply({ content: 'Lobiye katıldınız / Takım değiştirdiniz.', ephemeral: true });
            await lobbyData.message.edit({ embeds: [this.getLobbyEmbed(lobbyData)], components: [this.getLobbyComponents(lobbyData.mod)] });

            if (lobbyData.players.every(p => p !== null)) await this.startGame(channelId);
            return;
        }

        if (interaction.customId === 'leave_lobby') {
            const idx = lobbyData.players.findIndex(p => p && p.id === userId);
            if (idx === -1) return interaction.reply({ content: 'Zaten lobide değilsiniz.', ephemeral: true });
            
            lobbyData.players[idx] = null;
            await interaction.reply({ content: 'Lobiden ayrıldınız.', ephemeral: true });
            await lobbyData.message.edit({ embeds: [this.getLobbyEmbed(lobbyData)], components: [this.getLobbyComponents(lobbyData.mod)] });
            return;
        }

        if (interaction.customId === 'start_early') {
            if (lobbyData.host !== userId) return interaction.reply({ content: 'Sadece kurucu başlatabilir.', ephemeral: true });
            await interaction.reply({ content: 'Oyun başlatılıyor...', ephemeral: true });
            await this.startGame(channelId);
            return;
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
        
        // Boş koltukları botlarla doldur
        const finalPlayers = lobbyData.players.map((p, i) => {
            if (p) return p;
            return { id: `bot_${i}`, username: `Bot ${i}`, isBot: true };
        });

        await lobbyData.message.edit({ components: [] });

        const game = new BatakGame(lobbyData.message.channel, finalPlayers, lobbyData.mod);
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
