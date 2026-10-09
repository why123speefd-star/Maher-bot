import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands",
            description: "Browse every available command in a single list",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "MaherBot";
    const embed = createEmbed({
        title: `⚡ ${botName} Command Center`,
        description: `Welcome! Use the drop-down menu below to explore **${options.length - 1} categories** and all features available for your server.`,
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 Quick Setup Guide',
                value: [
                    '▸ `1.` **Configure Settings:** Run `/configwizard` to set up prefixes, roles, and log channels.',
                    '▸ `2.` **Enable Features:** Run `/commands dashboard` to turn systems on or off.',
                    '▸ `3.` **Explore Commands:** Choose a category from the selection menu below.',
                ].join('\n'),
                inline: false,
            },
            {
                name: '⚙️ Core Systems & Protection',
                value: [
                    '• **📈 Leveling:** XP Cooldowns (60s), 3+ char filter, & dedicated level-up channel routing.',
                    '• **🎫 Support Tickets:** Automated ticket dashboards and staff management.',
                    '• **🌐 Global Chat:** Multi-server cross-channel communication.',
                    '• **🔢 Counting Game:** Automated streak counting with anti-spam checks.',
                ].join('\n'),
                inline: false,
            },
            {
                name: '📌 Need Additional Help?',
                value: 'If you encounter any issues or bugs, click the **Report Bug** button below to submit a ticket.',
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: `Made with Maher • ${botName}`,
        iconURL: client.user?.displayAvatarURL?.({ size: 128 })
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setEmoji("🐛")
        .setStyle(ButtonStyle.Danger);

    const supportServerButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setEmoji("💬")
        .setURL("https://discord.gg/kBTgy5dpTF")
        .setStyle(ButtonStyle.Link);

    const akdragonServerButton = new ButtonBuilder()
        .setLabel("AKDRAGONx Server")
        .setEmoji("🐉")
        .setURL("https://discord.gg/xAzH6uPsu9")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select a command category to explore...",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportServerButton,
        akdragonServerButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the interactive help menu with command details"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "⏳ Help Menu Timed Out",
                    description: "This help session has expired. Type `/help` to open a new menu.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', error?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};
