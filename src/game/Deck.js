class Deck {
    constructor() {
        this.cards = [];
        // Maça: Pik, Kupa: Kupa, Karo: Karo, Sinek: Trefl
        const suits = ['♠', '♥', '♦', '♣']; 
        // Değerler (A en büyük)
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const numValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        
        for (let i = 0; i < suits.length; i++) {
            for (let j = 0; j < values.length; j++) {
                this.cards.push({ 
                    suit: suits[i], 
                    value: values[j], 
                    numValue: numValues[j],
                    id: `${suits[i]}${values[j]}` 
                });
            }
        }
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        const hands = [[], [], [], []];
        for (let i = 0; i < 52; i++) {
            hands[i % 4].push(this.cards[i]);
        }
        // Elleri sırala (Önce renklere, sonra büyüklüğe göre)
        for (let i = 0; i < 4; i++) {
            hands[i].sort((a, b) => {
                if (a.suit === b.suit) return a.numValue - b.numValue;
                return a.suit.localeCompare(b.suit);
            });
        }
        return hands;
    }
}

module.exports = Deck;
