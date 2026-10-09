
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_GLOBAL_COMMANDS = 100;
const MAX_OPTIONS = 25;
const MAX_NAME_LENGTH = 32;
const MAX_DESCRIPTION_LENGTH = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

const OPTION_SUBCOMMAND = 1;
const OPTION_SUBCOMMAND_GROUP = 2;

function getOptions(commandData) {
    return Array.isArray(commandData?.options)
        ? commandData.options
        : [];
}

function getSubcommandInfo(commandData) {
    const result = [];

    for (const option of getOptions(commandData)) {
        if (option.type === OPTION_SUBCOMMAND) {
            result.push(option.name);
        } else if (option.type === OPTION_SUBCOMMAND_GROUP) {
            for (const subcommand of getOptions(option)) {
                if (subcommand.type === OPTION_SUBCOMMAND) {
                    result.push(`${option.name}/${subcommand.name}`);
                }
            }
        }
    }

    return result;
}

function countSubcommands(commands) {
    return commands.reduce(
        (total, command) =>
            total + getSubcommandInfo(command).length,
        0
    );
}

async function getAllFiles(directory, fileList = []) {
    const entries = await fs.readdir(directory, {
        withFileTypes: true
    });

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const filePath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            // Preserve the project's existing convention.
            if (entry.name === 'modules') continue;

            await getAllFiles(filePath, fileList);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

function getCommandJson(command, filePath) {
    if (!command?.data) {
        throw new Error(`Missing command data in ${filePath}`);
    }

    if (typeof command.execute !== 'function') {
        throw new Error(`Missing execute() function in ${filePath}`);
    }

    if (typeof command.data.toJSON !== 'function') {
        throw new Error(`Command data must support toJSON() in ${filePath}`);
    }

    const json = command.data.toJSON();

    if (!json.name || typeof json.name !== 'string') {
        throw new Error(`Invalid command name in ${filePath}`);
    }

    return json;
}

export async function loadCommands(client) {
    const commandsPath = path.resolve(__dirname, '../../commands');

    let commandFiles;

    try {
        commandFiles = await getAllFiles(commandsPath);
    } catch (error) {
        logger.error(`Failed to read commands directory ${commandsPath}:`, error);
        throw error;
    }

    logger.info(`Found ${commandFiles.length} command files to load`);

    const loadedCommands = new Collection();
    const failures = [];
    const duplicates = new Map();

    for (const filePath of commandFiles) {
        const normalizedPath = filePath.replace(/\\/g, '/');

        try {
            const moduleUrl = pathToFileURL(filePath).href;
            const commandModule = await import(moduleUrl);
            const command = commandModule.default ?? commandModule;

            const commandJson = getCommandJson(command, normalizedPath);
            const commandName = commandJson.name;

            if (loadedCommands.has(commandName)) {
                const previous = loadedCommands.get(commandName);

                duplicates.set(commandName, [
                    previous.filePath,
                    normalizedPath
                ]);

                continue;
            }

            command.category = path.basename(path.dirname(filePath));
            command.filePath = normalizedPath;

            loadedCommands.set(commandName, command);

            const subcommands = getSubcommandInfo(commandJson);

            logger.info(
                `Loaded /${commandName} from ${normalizedPath}`
            );

            if (subcommands.length > 0) {
                logger.info(`  Subcommands: ${subcommands.join(', ')}`);
            }
        } catch (error) {
            failures.push({ filePath: normalizedPath, error });
            logger.error(`Failed to load command ${normalizedPath}:`, error);
        }
    }

    if (duplicates.size > 0) {
        for (const [name, files] of duplicates) {
            logger.error(
                `Duplicate top-level command "/${name}" found in:\n` +
                files.map(file => `  - ${file}`).join('\n') +
                '\nCombine these definitions into one command with subcommands.'
            );
        }

        throw new Error(
            `Found ${duplicates.size} duplicate command name(s). ` +
            'No command collection was installed. Resolve the duplicates first.'
        );
    }

    if (failures.length > 0) {
        throw new Error(
            `Failed to load ${failures.length} command file(s). ` +
            'Check the preceding logs before registering commands.'
        );
    }

    // Publish only after loading succeeds, so a failed reload does not
    // replace the current collection with an incomplete one.
    client.commands = loadedCommands;

    const commandList = [...loadedCommands.values()].map(command =>
        command.data.toJSON()
    );

    logger.info(
        `Loaded ${loadedCommands.size} unique top-level commands ` +
        `and ${countSubcommands(commandList)} subcommands`
    );

    return client.commands;
}

function collectCommandPayloads(client) {
    if (!client.commands || typeof client.commands.values !== 'function') {
        throw new Error(
            'Commands are not loaded. Call loadCommands(client) first.'
        );
    }

    const commands = [];
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
        const json = getCommandJson(command, command.filePath ?? '<unknown>');
        const name = json.name;

        if (registeredNames.has(name)) {
            throw new Error(
                `Duplicate command "/${name}" detected before registration`
            );
        }

        registeredNames.add(name);
        commands.push(json);
    }

    return {
        commands,
        totalSubcommands: countSubcommands(commands)
    };
}

function validateCommands(commands) {
    const errors = [];
    const topLevelNames = new Set();

    function validateName(name, location) {
        if (typeof name !== 'string' || name.length < 1 ||
            name.length > MAX_NAME_LENGTH) {
            errors.push(
                `${location}: name must contain 1-${MAX_NAME_LENGTH} characters`
            );
        }
    }

    function validateDescription(description, location) {
        if (typeof description !== 'string' ||
            description.length < 1 ||
            description.length > MAX_DESCRIPTION_LENGTH) {
            errors.push(
                `${location}: description must contain 1-${MAX_DESCRIPTION_LENGTH} characters`
            );
        }
    }

    function validateOptions(options, location, parentType = 'command') {
        if (!Array.isArray(options)) return;

        if (options.length > MAX_OPTIONS) {
            errors.push(
                `${location}: at most ${MAX_OPTIONS} options are allowed`
            );
        }

        let optionalOptionSeen = false;

        for (const option of options) {
            const optionLocation = `${location} -> ${option.name ?? 'unnamed option'}`;

            validateName(option.name, optionLocation);

            if (option.description !== undefined) {
                validateDescription(option.description, optionLocation);
            }

            if (Array.isArray(option.choices)) {
                if (option.choices.length > MAX_OPTIONS) {
                    errors.push(
                        `${optionLocation}: at most ${MAX_OPTIONS} choices are allowed`
                    );
                }

                for (const choice of option.choices) {
                    if (
                        typeof choice.name !== 'string' ||
                        choice.name.length < 1 ||
                        choice.name.length > 100
                    ) {
                        errors.push(
                            `${optionLocation}: choice names must contain 1-100 characters`
                        );
                    }

                    if (
                        typeof choice.value === 'string' &&
                        choice.value.length > 100
                    ) {
                        errors.push(
                            `${optionLocation}: string choice values cannot exceed 100 characters`
                        );
                    }
                }
            }

            if (option.required === true) {
                if (optionalOptionSeen) {
                    errors.push(
                        `${optionLocation}: required options must precede optional options`
                    );
                }
            } else if (
                option.type !== OPTION_SUBCOMMAND &&
                option.type !== OPTION_SUBCOMMAND_GROUP
            ) {
                optionalOptionSeen = true;
            }

            if (option.type === OPTION_SUBCOMMAND_GROUP) {
                const children = getOptions(option);

                if (children.length === 0) {
                    errors.push(`${optionLocation}: subcommand group is empty`);
                }

                for (const child of children) {
                    if (child.type !== OPTION_SUBCOMMAND) {
                        errors.push(
                            `${optionLocation}: groups may contain only subcommands`
                        );
                    }
                }

                validateOptions(children, optionLocation, 'group');
            } else if (option.type === OPTION_SUBCOMMAND) {
                validateOptions(getOptions(option), optionLocation, 'subcommand');
            } else if (option.options) {
                errors.push(
                    `${optionLocation}: regular options cannot contain nested options`
                );
            }
        }

        // Discord does not allow regular parameters alongside subcommands
        // or subcommand groups in the same command definition.
        if (parentType === 'command' && options.length > 0) {
            const hasSubcommands = options.some(option =>
                option.type === OPTION_SUBCOMMAND ||
                option.type === OPTION_SUBCOMMAND_GROUP
            );

            const hasRegularOptions = options.some(option =>
                option.type !== OPTION_SUBCOMMAND &&
                option.type !== OPTION_SUBCOMMAND_GROUP
            );

            if (hasSubcommands && hasRegularOptions) {
                errors.push(
                    `${location}: do not mix subcommands/groups with regular options`
                );
            }
        }
    }

    for (const command of commands) {
        const location = `Command "${command.name ?? 'unnamed'}"`;

        validateName(command.name, location);
        validateDescription(command.description, location);

        if (topLevelNames.has(command.name)) {
            errors.push(`Duplicate top-level command name: "${command.name}"`);
        }

        topLevelNames.add(command.name);
        validateOptions(getOptions(command), location);
    }

    if (errors.length > 0) {
        logger.error('Command validation failed:');

        for (const error of errors) {
            logger.error(`  - ${error}`);
        }

        throw new Error(
            `Command validation failed with ${errors.length} error(s)`
        );
    }
}

function prepareCommandsForRegistration(commands) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(
            `Command count (${commands.length}) is approaching Discord's ` +
            `${MAX_GLOBAL_COMMANDS} global slash-command limit`
        );
    }

    if (commands.length > MAX_GLOBAL_COMMANDS) {
        throw new Error(
            `Found ${commands.length} top-level global commands, but Discord ` +
            `allows only ${MAX_GLOBAL_COMMANDS}. Nothing was truncated. ` +
            'Merge compatible commands into subcommands or use guild commands ' +
            'where appropriate.'
        );
    }

    return commands;
}

async function registerGlobalCommands(
    client,
    clientId,
    commands,
    totalSubcommands
) {
    if (!clientId) {
        throw new Error('CLIENT_ID is required for slash command registration');
    }

    if (!client.rest || typeof client.rest.put !== 'function') {
        throw new Error('Discord REST client is unavailable');
    }

    validateCommands(commands);

    const commandsToRegister = prepareCommandsForRegistration(commands);
    const endpoint = `/applications/${clientId}/commands`;

    logger.info(
        `Registering ${commandsToRegister.length} top-level commands ` +
        `with ${totalSubcommands} subcommands`
    );

    // A single PUT replaces the application's global command definitions.
    // Do not clear the list first: that would create an unnecessary gap
    // where users have no registered global commands.
    if (botConfig.commands?.deleteCommands) {
        logger.warn(
            'commands.deleteCommands is ignored during registration: ' +
            'the bulk PUT below already replaces the global command list.'
        );
    }

    await client.rest.put(endpoint, {
        body: commandsToRegister
    });

    logger.info(
        `Successfully registered ${commandsToRegister.length} global commands`
    );
    logger.info(
        'Discord may take time to propagate global command changes.'
    );
}

export async function registerCommands(client, options = {}) {
    const clientId = options.clientId ?? process.env.CLIENT_ID ?? null;

    try {
        const { commands, totalSubcommands } = collectCommandPayloads(client);

        await registerGlobalCommands(
            client,
            clientId,
            commands,
            totalSubcommands
        );
    } catch (error) {
        logger.error('Global command registration failed:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const currentCommand = client.commands?.get(commandName);

    if (!currentCommand) {
        return {
            success: false,
            message: `Command "${commandName}" not found`
        };
    }

    try {
        const commandPath = path.resolve(currentCommand.filePath);
        const moduleUrl = pathToFileURL(commandPath);

        moduleUrl.searchParams.set('t', Date.now().toString());

        const commandModule = await import(moduleUrl.href);
        const newCommand = commandModule.default ?? commandModule;

        const newJson = getCommandJson(newCommand, commandPath);

        if (newJson.name !== commandName) {
            throw new Error(
                `Reloaded command name changed from "${commandName}" ` +
                `to "${newJson.name}". Rename it separately to avoid stale entries.`
            );
        }

        newCommand.category = currentCommand.category;
        newCommand.filePath = currentCommand.filePath;

        // Keep the existing handler if loading or validating the new one fails.
        client.commands.set(commandName, newCommand);

        logger.info(`Reloaded command: ${commandName}`);

        return {
            success: true,
            message: `Successfully reloaded command "${commandName}"`
        };
    } catch (error) {
        logger.error(`Failed to reload command "${commandName}":`, error);

        return {
            success: false,
            message: `Command reload failed: ${error.message}`
        };
    }
}
