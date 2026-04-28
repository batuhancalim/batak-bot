const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Deck = require('./Deck');

class BatakGame {
    constructor(channel, players, mod) {
        this.channel = channel;
        this.players = players; // 0, 1, 2, 3 indexli.
        this.mod = mod; // 'esli' veya 'tekli'
        this.hands = [];
        this.scores = [0, 0, 0, 0];
        
        this.state = 'INIT'; // INIT, BIDDING, TRUMP_SELECTION, PLAYING, FINISHED
        this.turnIndex = 0;
        this.bids = [0, 0, 0, 0];
        this.minBid = this.mod === 'esli' ? 8 : 5;
        this.currentHighestBid = this.minBid - 1; 
        this.highestBidderIndex = -1;
        this.passCount = 0;
        
        this.trumpSuit = null;
        this.currentTrick = []; // Şu an masadaki kartlar [{player, card}]
        this.trickTurnIndex = 0;
        this.tricksWon = [0, 0, 0, 0];
        this.roundStarterIndex = 0;
        this.playedCards = []; // Oynanan tüm kartların ID'leri
        
        this.mainMessage = null;
        this.playerInteractions = {}; // { userId: interaction }
        this.dummyInteraction = null;
        this.scores = [0, 0, 0, 0];
        this.roundCount = 0;
    }

    async start() {
        this.scores = [0, 0, 0, 0];
        this.roundCount = 0;
        await this.startRound();
    }

    async startRound() {
        const deck = new Deck();
        deck.shuffle();
        this.hands = deck.deal();
        
        this.state = 'BIDDING';
        
        const firstBidder = this.roundCount % 4;
        this.turnIndex = firstBidder; // İlk ihale sırası
        this.roundStarterIndex = firstBidder;
        this.bids = [-1, -1, -1, -1];
        this.currentHighestBid = this.minBid - 1;
        this.highestBidderIndex = -1;
        this.tricksWon = [0, 0, 0, 0];
        this.currentTrick = [];
        this.playedCards = [];
        this.passCount = 0;
        this.trumpBroken = false;
        this.dummyIndex = -1;
        this.playerInteractions = {};
        this.dummyInteraction = null;
        
        await this.updateMainMessage();
    }

    async updateMainMessage() {
        const embed = new EmbedBuilder()
            .setTitle(`İhaleli Batak (${this.mod === 'esli' ? 'Eşli' : 'Tekli'})`)
            .setColor(0x0099FF);
            
        let description = '';
        const currentPlayer = this.players[this.turnIndex];
        const isDummyTurn = this.state === 'PLAYING' && this.turnIndex === this.dummyIndex;
        const actualPlayer = isDummyTurn ? this.players[this.highestBidderIndex] : currentPlayer;

        if (this.state === 'BIDDING') {
            description = `**İhale Aşaması**\nSıra: <@${currentPlayer.id}>\n\n**Mevcut İhale:** ${this.currentHighestBid >= this.minBid ? this.currentHighestBid + ' (' + this.players[this.highestBidderIndex].username + ')' : 'Yok'}\n\n`;
            
            this.players.forEach((p, i) => {
                const bidText = this.bids[i] === 'PAS' ? 'PAS' : (this.bids[i] > 0 ? this.bids[i] : 'Bekliyor');
                description += `${p.username}: ${bidText}\n`;
            });
            
        } else if (this.state === 'TRUMP_SELECTION') {
            description = `**Koz Seçimi**\nİhaleyi alan: <@${this.players[this.highestBidderIndex].id}> (${this.currentHighestBid})\nLütfen kozu belirleyin.`;
        } else if (this.state === 'PLAYING' || this.state === 'RESOLVING') {
            description = `**Oyun Aşaması**\nİhale: **${this.currentHighestBid}** (<@${this.players[this.highestBidderIndex].id}>)\nKoz: **${this.trumpSuit}**\n\n`;
            
            if (this.state === 'PLAYING') {
                description += `Sıra: <@${actualPlayer.id}> ${isDummyTurn ? '*(Eşinin eli için)*' : ''}\n\n`;
            } else {
                description += `**El Sonuçlanıyor...**\n\n`;
            }
            
            if (this.dummyIndex !== -1) {
                description += `**Yerdeki El (Eş):**\n`;
                const dummyHand = this.hands[this.dummyIndex];
                const dSuits = { '♠': [], '♥': [], '♦': [], '♣': [] };
                dummyHand.forEach(c => dSuits[c.suit].push(c.value));
                for (const [suit, values] of Object.entries(dSuits)) {
                    if (values.length > 0) description += `${suit} ${values.join(', ')}\n`;
                }
                description += `\n`;
            }
            
            description += `**Masa:**\n`;
            if (this.currentTrick.length === 0) {
                description += `(Boş)\n`;
            } else {
                this.currentTrick.forEach(play => {
                    description += `${play.player.username}: ${play.card.id}\n`;
                });
            }
            
            description += `\n**Alınan Eller:**\n`;
            if (this.mod === 'esli') {
                description += `Takım 1 (Kuzey-Güney): ${this.tricksWon[0] + this.tricksWon[2]}\n`;
                description += `Takım 2 (Doğu-Batı): ${this.tricksWon[1] + this.tricksWon[3]}\n`;
            } else {
                this.players.forEach((p, i) => {
                    description += `${p.username}: ${this.tricksWon[i]}\n`;
                });
            }
        }

        embed.setDescription(description);

        const components = [];
        const viewHandBtn = new ButtonBuilder()
            .setCustomId('open_hand')
            .setLabel('Kartlarımı Gör')
            .setStyle(ButtonStyle.Secondary);

        if (this.state === 'BIDDING') {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_bid_menu')
                    .setLabel('İhale Ver / Pas De')
                    .setStyle(ButtonStyle.Primary),
                viewHandBtn
            ));
        } else if (this.state === 'TRUMP_SELECTION') {
             components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_trump_menu')
                    .setLabel('Koz Seç')
                    .setStyle(ButtonStyle.Success),
                viewHandBtn
            ));
        } else if (this.state === 'PLAYING') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_hand')
                    .setLabel('Kartlarımı Gör')
                    .setStyle(ButtonStyle.Primary)
            );
            if (this.mod === 'esli' && this.dummyIndex !== -1) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_dummy_hand')
                        .setLabel('Eşimin Elini Gör')
                        .setStyle(ButtonStyle.Success)
                );
            }
            components.push(row);
        }

        if (!this.mainMessage) {
            this.mainMessage = await this.channel.send({ embeds: [embed], components });
        } else {
            await this.mainMessage.edit({ embeds: [embed], components });
        }
        
        const canBotPlay = this.state === 'BIDDING' || this.state === 'TRUMP_SELECTION' || this.state === 'PLAYING';
        if (canBotPlay && actualPlayer && actualPlayer.isBot) {
            setTimeout(() => this.playBotTurn(), 1500);
        }
    }

    createHandButtons(hand, validCards = [], forceDisable = false) {
        const components = [];
        let currentRow = new ActionRowBuilder();
        const suitColors = { '♠': ButtonStyle.Secondary, '♥': ButtonStyle.Danger, '♦': ButtonStyle.Danger, '♣': ButtonStyle.Primary };
        
        hand.forEach((card) => {
            if (currentRow.components.length >= 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            const isPlayable = forceDisable ? false : validCards.some(vc => vc.id === card.id);
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(forceDisable ? `dummy_btn_${card.id}` : `play_card_${card.id}`)
                    .setLabel(`${card.suit} ${card.value}`)
                    .setStyle(suitColors[card.suit])
                    .setDisabled(!isPlayable)
            );
        });
        if (currentRow.components.length > 0) components.push(currentRow);
        return components;
    }

    async updateEphemeralPanels() {
        for (const [playerId, interaction] of Object.entries(this.playerInteractions)) {
            const playerIndex = this.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) continue;
            
            const hand = this.hands[playerIndex];
            if (!hand || hand.length === 0) continue; 
            
            let valid = [];
            let forceDisable = true;
            if (this.state === 'PLAYING' && this.turnIndex === playerIndex) {
                valid = this.getValidCards(hand);
                forceDisable = false;
            }
            const handComponents = this.createHandButtons(hand, valid, forceDisable);
            
            try {
                await interaction.editReply({ content: '**Kalan Eliniz:**', components: handComponents });
            } catch (e) {
                // interaction expired
            }
        }
        
        if (this.dummyInteraction && this.dummyIndex !== -1) {
            const hand = this.hands[this.dummyIndex];
            if (hand && hand.length > 0) {
                let valid = [];
                let forceDisable = true;
                if (this.state === 'PLAYING' && this.turnIndex === this.dummyIndex) {
                    valid = this.getValidCards(hand);
                    forceDisable = false;
                }
                const handComponents = this.createHandButtons(hand, valid, forceDisable);
                try {
                    await this.dummyInteraction.editReply({ content: '**Eşinizin Kalan Eli:**', components: handComponents });
                } catch(e) {}
            }
        }
    }

    async handleInteraction(interaction) {
        const userId = interaction.user.id;
        const currentPlayer = this.players[this.turnIndex];
        const isDummyTurn = this.state === 'PLAYING' && this.turnIndex === this.dummyIndex;
        const expectedUserId = isDummyTurn ? this.players[this.highestBidderIndex].id : currentPlayer.id;

        // İhale Butonu
        if (interaction.customId === 'open_bid_menu') {
            if (userId !== currentPlayer.id) return interaction.reply({ content: 'Şu an senin sıran değil!', ephemeral: true });

            const options = [{ label: 'Pas', value: 'PAS' }];
            const startBid = Math.max(this.minBid, this.currentHighestBid + 1);
            
            for (let i = startBid; i <= 13; i++) {
                options.push({ label: `${i}`, value: `${i}` });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('submit_bid')
                        .setPlaceholder('İhaleni seç...')
                        .addOptions(options)
                );
            
            const hand = this.hands[this.turnIndex];
            const handComponents = this.createHandButtons(hand, [], true);
            handComponents.push(row);

            await interaction.reply({ content: '**Eliniz:**', components: handComponents, ephemeral: true });
        }
        
        // İhale Gönderimi
        else if (interaction.customId === 'submit_bid') {
            if (userId !== currentPlayer.id) return interaction.reply({ content: 'Sıra geçti.', ephemeral: true });

            const bidValue = interaction.values[0];
            if (bidValue === 'PAS') {
                this.bids[this.turnIndex] = 'PAS';
                this.passCount++;
                await interaction.update({ content: 'Pas dedin.', components: [] });
                setTimeout(() => interaction.deleteReply().catch(()=>{}), 2000);
            } else {
                const bid = parseInt(bidValue);
                this.bids[this.turnIndex] = bid;
                this.currentHighestBid = bid;
                this.highestBidderIndex = this.turnIndex;
                this.passCount = 0;
                await interaction.update({ content: `${bid} ihalesine girdin.`, components: [] });
                setTimeout(() => interaction.deleteReply().catch(()=>{}), 2000);
            }
            
            this.nextBiddingTurn();
        }

        // Yeni Rounda Başlama
        else if (interaction.customId === 'next_round') {
            await interaction.deferUpdate();
            this.roundCount++;
            await this.startRound();
        }

        // Kartları Görme Paneli (Kalıcı Mesaj)
        else if (interaction.customId === 'open_hand' || interaction.customId === 'view_hand_only') {
            const playerIndex = this.players.findIndex(p => p.id === userId);
            if (playerIndex === -1) return interaction.reply({ content: 'Bu oyunda değilsiniz.', ephemeral: true });
            
            const hand = this.hands[playerIndex];
            let valid = [];
            let forceDisable = true;
            if (this.state === 'PLAYING' && this.turnIndex === playerIndex) {
                 valid = this.getValidCards(hand);
                 forceDisable = false;
            }
            
            const handComponents = this.createHandButtons(hand, valid, forceDisable);
            await interaction.reply({ content: '**Eliniz:**', components: handComponents, ephemeral: true });
            
            this.playerInteractions[userId] = interaction;
        }
        
        // Eşin Elini Görme Paneli
        else if (interaction.customId === 'open_dummy_hand') {
            if (userId !== this.players[this.highestBidderIndex].id) {
                return interaction.reply({ content: 'Eşin elini sadece ihaleyi alan görebilir!', ephemeral: true });
            }
            
            const hand = this.hands[this.dummyIndex];
            let valid = [];
            let forceDisable = true;
            if (this.state === 'PLAYING' && this.turnIndex === this.dummyIndex) {
                 valid = this.getValidCards(hand);
                 forceDisable = false;
            }
            
            const handComponents = this.createHandButtons(hand, valid, forceDisable);
            await interaction.reply({ content: '**Eşinizin Eli:**', components: handComponents, ephemeral: true });
            
            this.dummyInteraction = interaction;
        }

        // Koz Menüsü Açma
        else if (interaction.customId === 'open_trump_menu') {
            if (userId !== currentPlayer.id) return interaction.reply({ content: 'Kozu ihale sahibi seçebilir!', ephemeral: true });
            
            const options = [
                { label: 'Maça ♠', value: '♠' },
                { label: 'Kupa ♥', value: '♥' },
                { label: 'Karo ♦', value: '♦' },
                { label: 'Sinek ♣', value: '♣' }
            ];

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('submit_trump')
                        .setPlaceholder('Koz rengini seç...')
                        .addOptions(options)
                );

            await interaction.reply({ content: 'Kozu belirle:', components: [row], ephemeral: true });
        }

        // Koz Gönderimi
        else if (interaction.customId === 'submit_trump') {
            if (userId !== currentPlayer.id) return interaction.reply({ content: 'Hata.', ephemeral: true });
            
            this.trumpSuit = interaction.values[0];
            this.state = 'PLAYING';
            this.roundStarterIndex = 0; 
            this.turnIndex = this.highestBidderIndex; 
            this.trumpBroken = false;
            if (this.mod === 'esli') {
                this.dummyIndex = (this.highestBidderIndex + 2) % 4;
            } else {
                this.dummyIndex = -1;
            }
            
            await interaction.update({ content: `Koz **${this.trumpSuit}** olarak belirlendi.`, components: [] });
            setTimeout(() => interaction.deleteReply().catch(()=>{}), 2000);
            this.updateMainMessage();
            this.updateEphemeralPanels();
        }

        // Kart Oynama
        else if (interaction.customId.startsWith('play_card_')) {
            if (this.state !== 'PLAYING') return interaction.reply({ content: 'Şu an kart oynama aşamasında değiliz.', ephemeral: true });
            if (userId !== expectedUserId) return interaction.reply({ content: 'Şu an senin sıran değil! Lütfen sıran geldiğinde ana menüdeki butona tıkla.', ephemeral: true });
            
            const cardId = interaction.customId.split('_')[2];
            const hand = this.hands[this.turnIndex];
            const card = hand.find(c => c.id === cardId);
            
            if (!card) return interaction.update({ content: 'Bu kart elinizde yok veya zaten oynanmış.', components: [] });
            
            const validCards = this.getValidCards(hand);
            
            if (!validCards.some(vc => vc.id === card.id)) {
                // Eğer buton bir şekilde tıklanabilir kaldıysa ve kural dışıysa, menüyü güncelleyip butonları doğru pasif hale getirelim
                const handComponents = this.createHandButtons(hand, validCards, false);
                return interaction.update({ content: '❌ **Bu kartı oynayamazsın!** Renk uymalı veya gerekiyorsa büyütmeli/koz çakmalısın.\nLütfen aktif kartlardan birini seç:', components: handComponents });
            }

            // Kartı elden çıkar
            this.hands[this.turnIndex].splice(hand.indexOf(card), 1);
            this.currentTrick.push({ player: currentPlayer, card: card });
            
            // Oynadıktan sonra elindeki kalan kartları güncelle (tüm butonları pasif yap ki tekrar tıklamasın)
            const newHand = this.hands[this.turnIndex];
            const handComponents = this.createHandButtons(newHand, [], true);
            
            const title = (this.turnIndex === this.dummyIndex) ? '**Eşinizin Kalan Eli:**' : '**Kalan Eliniz:**';
            await interaction.update({ content: `✅ **${card.id}** oynadın.\n${title}`, components: handComponents });
            
            if (this.turnIndex === this.dummyIndex) {
                this.dummyInteraction = interaction;
            } else {
                this.playerInteractions[userId] = interaction;
            }
            
            this.nextTrickTurn();
        }
    }

    nextBiddingTurn() {
        let i = 1;
        while(i <= 4) {
            this.turnIndex = (this.turnIndex + 1) % 4;
            if (this.bids[this.turnIndex] !== 'PAS') {
                break;
            }
            i++;
        }

        if (this.passCount >= 3) {
            if (this.highestBidderIndex === -1) {
                // Herkes pas geçti. Mecburi ihaleyi dağıtana veya 1. oyuncuya ver
                this.highestBidderIndex = 3; 
                this.currentHighestBid = this.minBid;
            }
            this.state = 'TRUMP_SELECTION';
            this.turnIndex = this.highestBidderIndex;
        }
        
        this.updateMainMessage();
    }

    nextTrickTurn() {
        if (this.currentTrick.length === 4) {
            // El bitti, kazananı bul
            this.resolveTrick();
        } else {
            this.turnIndex = (this.turnIndex + 1) % 4;
            this.updateMainMessage();
            this.updateEphemeralPanels();
        }
    }

    resolveTrick() {
        const leadSuit = this.currentTrick[0].card.suit;
        let winningPlay = this.currentTrick[0];
        
        for (let i = 1; i < 4; i++) {
            const play = this.currentTrick[i];
            const winningCard = winningPlay.card;
            const currentCard = play.card;
            
            if (currentCard.suit === this.trumpSuit && winningCard.suit !== this.trumpSuit) {
                winningPlay = play;
            } else if (currentCard.suit === winningCard.suit && currentCard.numValue > winningCard.numValue) {
                winningPlay = play;
            }
        }
        
        const winnerIndex = this.players.findIndex(p => p.id === winningPlay.player.id);
        this.tricksWon[winnerIndex]++;
        
        // Oynanan kartları hafızaya kaydet ve koz kırıldı mı kontrol et
        for (let i = 0; i < 4; i++) {
            this.playedCards.push(this.currentTrick[i].card.id);
        }
        if (this.currentTrick.some(play => play.card.suit === this.trumpSuit)) {
            this.trumpBroken = true;
        }
        
        // 4. kartın masada gözükmesi için durumu RESOLVING yapıp ana mesajı güncelleyelim
        this.state = 'RESOLVING'; 
        this.updateMainMessage();
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription(`Eli **${winningPlay.player.username}** kazandı! (${winningPlay.card.id})`);
            
        this.channel.send({ embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete(), 4000);
        });

        setTimeout(() => {
            this.currentTrick = [];
            this.turnIndex = winnerIndex;
            
            // Oyun bitti mi kontrolü
            const totalTricks = this.tricksWon.reduce((a, b) => a + b, 0);
            if (totalTricks === 13) {
                this.calculateScoresAndShowLeaderboard();
            } else {
                this.state = 'PLAYING';
                this.updateMainMessage();
                this.updateEphemeralPanels();
            }
        }, 4000);
    }
    
    calculateScoresAndShowLeaderboard() {
        let roundScores = [0, 0, 0, 0];
        
        if (this.mod === 'esli') {
            const team1Tricks = this.tricksWon[0] + this.tricksWon[2];
            const team2Tricks = this.tricksWon[1] + this.tricksWon[3];
            
            if (this.highestBidderIndex === 0 || this.highestBidderIndex === 2) {
                if (team1Tricks >= this.currentHighestBid) {
                    roundScores[0] = team1Tricks; roundScores[2] = team1Tricks;
                } else {
                    roundScores[0] = -this.currentHighestBid; roundScores[2] = -this.currentHighestBid;
                }
                roundScores[1] = team2Tricks; roundScores[3] = team2Tricks;
            } else {
                if (team2Tricks >= this.currentHighestBid) {
                    roundScores[1] = team2Tricks; roundScores[3] = team2Tricks;
                } else {
                    roundScores[1] = -this.currentHighestBid; roundScores[3] = -this.currentHighestBid;
                }
                roundScores[0] = team1Tricks; roundScores[2] = team1Tricks;
            }
            this.scores[0] += roundScores[0];
            this.scores[1] += roundScores[1];
            this.scores[2] += roundScores[2];
            this.scores[3] += roundScores[3];
        } else {
            for (let i = 0; i < 4; i++) {
                if (i === this.highestBidderIndex) {
                    if (this.tricksWon[i] >= this.currentHighestBid) {
                        roundScores[i] = this.tricksWon[i];
                    } else {
                        roundScores[i] = -this.currentHighestBid;
                    }
                } else {
                    roundScores[i] = this.tricksWon[i];
                }
                this.scores[i] += roundScores[i];
            }
        }
        
        this.state = 'ENDED';
        this.showLeaderboard(roundScores);
    }

    async showLeaderboard(roundScores) {
        let desc = '**Bu Elin Sonuçları:**\n';
        if (this.mod === 'esli') {
            desc += `Takım 1 (Kuzey-Güney): ${roundScores[0] > 0 ? '+' : ''}${roundScores[0]}\n`;
            desc += `Takım 2 (Doğu-Batı): ${roundScores[1] > 0 ? '+' : ''}${roundScores[1]}\n\n`;
            desc += `**Genel Puan Durumu:**\n`;
            desc += `Takım 1: **${this.scores[0]}**\n`;
            desc += `Takım 2: **${this.scores[1]}**\n`;
        } else {
            for (let i = 0; i < 4; i++) {
                desc += `${this.players[i].username}: ${roundScores[i] > 0 ? '+' : ''}${roundScores[i]}\n`;
            }
            desc += `\n**Genel Puan Durumu:**\n`;
            const sorted = this.players.map((p, i) => ({ name: p.username, score: this.scores[i] })).sort((a,b) => b.score - a.score);
            sorted.forEach((p, index) => {
                desc += `${index + 1}. ${p.name}: **${p.score}**\n`;
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Round Bitti - Puan Tablosu')
            .setColor(0xFFD700)
            .setDescription(desc);
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('next_round')
                .setLabel('Yeni Rounda Başla')
                .setStyle(ButtonStyle.Success)
        );
        
        await this.mainMessage.edit({ embeds: [embed], components: [row] });
    }

    endGame() {
        // Artık kullanılmıyor ama oyun tamamen bitirilmek istenirse diye durabilir
        if (this.onGameEnd) this.onGameEnd(this.channel.id);
    }

    getValidCards(hand) {
        if (this.currentTrick.length === 0) {
            if (this.mod === 'tekli' && !this.trumpBroken) {
                const nonTrumps = hand.filter(c => c.suit !== this.trumpSuit);
                if (nonTrumps.length > 0) return nonTrumps;
            }
            return hand;
        }
        
        const leadSuit = this.currentTrick[0].card.suit;
        let winningCard = this.currentTrick[0].card;
        let isTrumped = winningCard.suit === this.trumpSuit && leadSuit !== this.trumpSuit;
        
        for (let i = 1; i < this.currentTrick.length; i++) {
            const card = this.currentTrick[i].card;
            if (card.suit === this.trumpSuit && winningCard.suit !== this.trumpSuit) {
                winningCard = card;
                isTrumped = true;
            } else if (card.suit === winningCard.suit && card.numValue > winningCard.numValue) {
                winningCard = card;
            }
        }
        
        const cardsOfLeadSuit = hand.filter(c => c.suit === leadSuit);
        
        if (cardsOfLeadSuit.length > 0) {
            // Renge uymak zorunlu.
            // Eğer karta zaten koz çakıldıysa (isTrumped), rengi büyütme zorunluluğu kalkar. İstediğini atabilir.
            if (isTrumped) return cardsOfLeadSuit;
            
            // Eğer çakılmadıysa ve elinde yerdeki en büyük kartı geçebilecek kart varsa onu atmak zorundadır.
            const beatingCards = cardsOfLeadSuit.filter(c => c.numValue > winningCard.numValue);
            if (beatingCards.length > 0) return beatingCards;
            
            // Geçemiyorsa o renkten herhangi birini atabilir.
            return cardsOfLeadSuit;
        } else {
            // Renk yoksa koz atmak zorundadır (eğer varsa)
            const trumps = hand.filter(c => c.suit === this.trumpSuit);
            if (trumps.length > 0) {
                if (isTrumped) {
                    // Yerde zaten koz var. O kozu geçmek ZORUNDADIR (eğer geçebiliyorsa).
                    const beatingTrumps = trumps.filter(c => c.numValue > winningCard.numValue);
                    if (beatingTrumps.length > 0) return beatingTrumps;
                    
                    // Geçemiyorsa elindeki herhangi bir kozu atabilir (mecburi çakma)
                    return trumps;
                } else {
                    // İlk defa çakacak, herhangi bir kozu atabilir.
                    return trumps;
                }
            }
            // Ne renk var ne koz var, her şeyi atabilir.
            return hand;
        }
    }

    async playBotTurn() {
        const isDummyTurn = this.state === 'PLAYING' && this.turnIndex === this.dummyIndex;
        const actualPlayer = isDummyTurn ? this.players[this.highestBidderIndex] : this.players[this.turnIndex];
        
        if (!actualPlayer.isBot) return; // İnsan hamlesiyse dön

        if (this.state === 'BIDDING') {
            this.bids[this.turnIndex] = 'PAS';
            this.passCount++;
            this.nextBiddingTurn();
        } else if (this.state === 'TRUMP_SELECTION') {
            this.trumpSuit = '♠'; // Basitçe maça seçer
            this.state = 'PLAYING';
            this.roundStarterIndex = this.highestBidderIndex;
            this.turnIndex = this.highestBidderIndex;
            this.trumpBroken = false;
            if (this.mod === 'esli') {
                this.dummyIndex = (this.highestBidderIndex + 2) % 4;
            } else {
                this.dummyIndex = -1;
            }
            this.updateMainMessage();
        } else if (this.state === 'PLAYING') {
            const hand = this.hands[this.turnIndex];
            const validCards = this.getValidCards(hand);
            let cardToPlay = validCards[0]; // Varsayılan en küçük
            
            if (this.currentTrick.length === 0) {
                // Masaya ilk kartı atan bot ise "Kesin Alır" (Master) analizi yapar
                let masterCards = validCards.filter(card => {
                    let isMaster = true;
                    // Kendisinden büyük tüm kartlar kontrol ediliyor
                    for (let v = card.numValue + 1; v <= 14; v++) {
                        const valStr = v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : v === 14 ? 'A' : v.toString();
                        const higherCardId = `${card.suit}${valStr}`;
                        // Daha büyük kart oynanmadıysa ve benim elimde de değilse, benim kartım master değildir
                        if (!this.playedCards.includes(higherCardId) && !hand.some(c => c.id === higherCardId)) {
                            isMaster = false;
                            break;
                        }
                    }
                    return isMaster;
                });

                if (masterCards.length > 0) {
                    // Kesin alacak kartı var! Kozları harcamamak için önce koz olmayanları atar
                    const nonTrumpMasters = masterCards.filter(c => c.suit !== this.trumpSuit);
                    if (nonTrumpMasters.length > 0) {
                        cardToPlay = nonTrumpMasters[nonTrumpMasters.length - 1]; // En büyükleri önce çıksın
                    } else {
                        cardToPlay = masterCards[masterCards.length - 1]; 
                    }
                } else {
                    // Kesin eli alamıyorsa, elindeki en küçük koz olmayan kartı atarak o rengi bitirmeye / çöpleri eritmeye çalışır
                    const nonTrumps = validCards.filter(c => c.suit !== this.trumpSuit);
                    if (nonTrumps.length > 0) {
                        cardToPlay = nonTrumps[0]; // nonTrumps dizisi zaten küçükten büyüğe sıralı
                    } else {
                        cardToPlay = validCards[0]; // Sadece kozu kaldıysa mecburen en küçük kozunu atar
                    }
                }
            } else {
                // Masadaki en büyük kartı bul
                let winningPlay = this.currentTrick[0];
                for (let i = 1; i < this.currentTrick.length; i++) {
                    const play = this.currentTrick[i];
                    if (play.card.suit === this.trumpSuit && winningPlay.card.suit !== this.trumpSuit) {
                        winningPlay = play;
                    } else if (play.card.suit === winningPlay.card.suit && play.card.numValue > winningPlay.card.numValue) {
                        winningPlay = play;
                    }
                }

                // Yenebilen kartları bul
                const beatingCards = validCards.filter(c => {
                    if (c.suit === this.trumpSuit && winningPlay.card.suit !== this.trumpSuit) return true;
                    if (c.suit === winningPlay.card.suit && c.numValue > winningPlay.card.numValue) return true;
                    return false;
                });

                if (beatingCards.length > 0) {
                    // Yenebiliyorsa, yenenler içindeki en küçük kartı atar (kâğıt israf etmemek için)
                    cardToPlay = beatingCards[0];
                } else {
                    // Yenemiyorsa, elindeki en küçük geçerli kartı atar
                    cardToPlay = validCards[0];
                }
            }
            
            this.hands[this.turnIndex].splice(hand.indexOf(cardToPlay), 1);
            this.currentTrick.push({ player: this.players[this.turnIndex], card: cardToPlay });
            this.nextTrickTurn();
        }
    }
}

module.exports = BatakGame;
