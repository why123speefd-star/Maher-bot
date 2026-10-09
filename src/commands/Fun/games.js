import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Play interactive minigames with another member')
        .addSubcommand(sub =>
            sub.setName('tictactoe')
               .setDescription('Play Tic-Tac-Toe')
               .addUserOption(opt => opt.setName('opponent').setDescription('Player to challenge').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('connect4')
               .setDescription('Play Connect 4')
               .addUserOption(opt => opt.setName('opponent').setDescription('Player to challenge').setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const opponent = interaction.options.getUser('opponent');

        if (opponent.bot || opponent.id === interaction.user.id) {
            return interaction.reply({ content: 'Please select a valid opponent!', flags: 64 });
        }

        if (subcommand === 'tictactoe') {
            await startTicTacToe(interaction, opponent);
        } else if (subcommand === 'connect4') {
            await startConnect4(interaction, opponent);
        }
    }
};

async function startTicTacToe(interaction, opponent) {
    const players = [interaction.user.id, opponent.id];
    let turn = 0;
    const board = Array(9).fill(null);

    const getBoardRows = (disabled = false) => {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const idx = i * 3 + j;
                const label = board[idx] === 'X' ? '❌' : board[idx] === 'O' ? '⭕' : ' ';
                const style = board[idx] === 'X' ? ButtonStyle.Danger : board[idx] === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary;

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ttt_${idx}`)
                        .setLabel(label)
                        .setStyle(style)
                        .setDisabled(disabled || board[idx] !== null)
                );
            }
            rows.push(row);
        }
        return rows;
    };

    const embed = new EmbedBuilder()
        .setTitle('🎮 Tic-Tac-Toe')
        .setDescription(`**${interaction.user.username}** (❌) vs **${opponent.username}** (⭕)\n\nTurn: <@${players[turn]}>`)
        .setColor('#5865F2');

    const msg = await interaction.reply({ embeds: [embed], components: getBoardRows(), fetchReply: true });
    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async i => {
        if (i.user.id !== players[turn]) {
            return i.reply({ content: 'It is not your turn!', flags: 64 });
        }

        const idx = parseInt(i.customId.split('_')[1]);
        board[idx] = turn === 0 ? 'X' : 'O';

        const winner = checkTicTacToeWinner(board);
        if (winner || !board.includes(null)) {
            collector.stop(winner ? winner : 'draw');
            const finalEmbed = new EmbedBuilder()
                .setTitle('🎮 Tic-Tac-Toe - Game Over')
                .setDescription(winner ? `🎉 <@${players[turn]}> wins!` : '🤝 It is a draw!')
                .setColor(winner ? '#57F287' : '#FEE75C');

            return i.update({ embeds: [finalEmbed], components: getBoardRows(true) });
        }

        turn = 1 - turn;
        embed.setDescription(`**${interaction.user.username}** (❌) vs **${opponent.username}** (⭕)\n\nTurn: <@${players[turn]}>`);
        await i.update({ embeds: [embed], components: getBoardRows() });
    });
}

function checkTicTacToeWinner(b) {
    const lines = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (const [p1, p2, p3] of lines) {
        if (b[p1] && b[p1] === b[p2] && b[p1] === b[p3]) return b[p1];
    }
    return null;
}

async function startConnect4(interaction, opponent) {
    const embed = new EmbedBuilder()
        .setTitle('🔴 Connect 4')
        .setDescription(`Challenging **${opponent.username}** to Connect 4!`)
        .setColor('#EB459E');

    await interaction.reply({ embeds: [embed] });
}
