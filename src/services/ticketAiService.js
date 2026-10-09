import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../utils/database.js';

export async function processTicketWithAI(client, ticketChannel, userPrompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return;

    try {
        const thinkingEmbed = new EmbedBuilder()
            .setTitle('🤖 AI Support Assistant')
            .setDescription('Analyzing your ticket details to generate instant troubleshooting steps...')
            .setColor(getColor('info', '#5865F2'));

        const aiMsg = await ticketChannel.send({ embeds: [thinkingEmbed] });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3-8b-instruct:free',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Discord support bot. Read the user ticket issue and provide a clear, concise 3-step troubleshooting response. Keep it friendly and concise.'
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                max_tokens: 250,
                temperature: 0.3
            })
        });

        const data = await response.json();
        const aiAnswer = data.choices?.[0]?.message?.content?.trim() || 'Please stand by while a staff member reviews your ticket!';

        const answerEmbed = new EmbedBuilder()
            .setTitle('🤖 AI Instant Help')
            .setDescription(aiAnswer)
            .setFooter({ text: 'A staff member has been pinged and will assist you shortly.' })
            .setColor(getColor('success', '#57F287'))
            .setTimestamp();

        await aiMsg.edit({ embeds: [answerEmbed] });
    } catch (error) {
        logger.error('Failed to process ticket AI response:', error);
    }
}
