
import 'dotenv/config';

import path from 'node:path';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import {
  getServerCounters,
  saveServerCounters,
  updateCounter,
} from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import {
  loadCommands,
  registerCommands as registerSlashCommands,
} from './handlers/loaders/commandLoader.js';
import {
  runSafeTask,
  handleTaskError,
  ErrorCodes,
} from './utils/errorHandler.js';
import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';
import pkg from '../package.json' with { type: 'json' };
import {
  EXPECTED_SCHEMA_VERSION,
  EXPECTED_SCHEMA_LABEL,
} from './config/database/schemaVersion.js';

import createAuthRouter from './dashboard/routes/auth.js';
import createServersRouter from './dashboard/routes/servers.js';
import createSettingsRouter from './dashboard/routes/settings.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildBans,
      ],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();

    this.db = null;
    this.webServer = null;
    this.isShuttingDown = false;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  async start() {
    try {
      startupLog('Starting TitanBot...');

      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;

      const dbStatus = this.db.getStatus();

      if (dbStatus.isDegraded) {
        logger.warn('Database running in degraded mode.');
        logger.warn('Persistent dashboard storage may be unavailable.');
      } else {
        startupLog(
          `Database Status: ${dbStatus.connectionType} (operational)`
        );
      }

      startupLog('Starting web server...');
      this.startWebServer();

      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Commands loaded: ${this.commands.size}`);

      startupLog('Loading handlers...');
      await this.loadHandlers();
      startupLog('Handlers loaded');

      initializeMusic(this);

      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');

      // Kept enabled to avoid breaking existing bot functionality.
      // Remove this registration only after dashboard replacements
      // for the existing commands have been implemented and tested.
      startupLog('Registering slash commands globally...');
      await this.registerCommands();
      startupLog('Slash commands registration complete');

      const databaseMode = dbStatus.isDegraded
        ? 'In-memory fallback (data resets after restart)'
        : 'Connected (persistent storage enabled)';

      const handlerSummary =
        `${this.buttons.size} buttons, ` +
        `${this.selectMenus.size} menus, ${this.modals.size} modals`;

      startupLog(
        `ONLINE | ${this.commands.size} commands loaded | ` +
        `${handlerSummary} | Database: ${databaseMode}`
      );

      this.setupCronJobs();
    } catch (error) {
      logger.error('Fatal error during bot initialization:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();

    const configuredPort = Number(
      this.config.api?.port || process.env.PORT || 8080
    );

    const maxPortRetryAttempts = Number(
      process.env.PORT_RETRY_ATTEMPTS || 5
    );

    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';

    // Railway runs behind a reverse proxy.
    app.set('trust proxy', 1);

    // CORS: include PUT and the CSRF header used by the dashboard.
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin)
        ? corsOrigin
        : [corsOrigin];

      const origin = req.headers.origin;

      if (allowedOrigins.includes('*')) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      } else if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
      }

      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );

      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-CSRF-Token'
      );

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      next();
    });

    // Existing in-memory request rate limiter.
    const requestCounts = new Map();
    const windowMs = this.config.api?.rateLimit?.windowMs || 60000;
    const maxRequests = this.config.api?.rateLimit?.max || 100;

    app.use((req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;

      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }

      const times = requestCounts
        .get(ip)
        .filter((time) => time > windowStart);

      if (times.length >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
        });
      }

      times.push(now);
      requestCounts.set(ip, times);

      next();
    });

    let dashboardEnabled = false;

    // Use the PostgreSQL pool already owned by the existing database
    // wrapper. Do not enable dashboard persistence in degraded mode.
    const dashboardPool = this.db?.db?.pool;

    const dashboardEnvironmentReady = Boolean(
      process.env.DASHBOARD_BASE_URL &&
      process.env.DISCORD_OAUTH_CLIENT_ID &&
      process.env.DISCORD_OAUTH_CLIENT_SECRET &&
      process.env.DASHBOARD_SESSION_SECRET
    );

    if (!dashboardPool) {
      logger.warn(
        'Dashboard disabled: PostgreSQL pool is unavailable.'
      );
    } else if (!dashboardEnvironmentReady) {
      logger.warn(
        'Dashboard disabled: configure DASHBOARD_BASE_URL, ' +
        'DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, ' +
        'and DASHBOARD_SESSION_SECRET.'
      );
    } else {
      const projectRoot = process.cwd();
      const viewsDir = path.join(
        projectRoot,
        'src',
        'dashboard',
        'views'
      );
      const publicDir = path.join(projectRoot, 'public');

      const PgSessionStore = connectPgSimple(session);

      app.use(express.json({ limit: '32kb' }));

      app.use(
        session({
          store: new PgSessionStore({
            pool: dashboardPool,
            tableName: 'user_sessions',
            createTableIfMissing: true,
          }),
          name: 'maher.sid',
          secret: process.env.DASHBOARD_SESSION_SECRET,
          resave: false,
          saveUninitialized: false,
          cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
          },
        })
      );

      app.use(
        '/css',
        express.static(path.join(publicDir, 'css'), {
          index: false,
        })
      );

      app.use(
        '/js',
        express.static(path.join(publicDir, 'js'), {
          index: false,
        })
      );

      app.get('/', (req, res) => {
        res.sendFile(path.join(viewsDir, 'login.html'));
      });

      app.get('/login.html', (req, res) => {
        res.sendFile(path.join(viewsDir, 'login.html'));
      });

      app.get('/servers.html', (req, res) => {
        res.sendFile(path.join(viewsDir, 'servers.html'));
      });

      app.get('/dashboard.html', (req, res) => {
        res.sendFile(path.join(viewsDir, 'dashboard.html'));
      });

      app.use('/auth', createAuthRouter);
      app.use('/api/servers', createServersRouter(this));

      app.use(
        '/api/settings',
        createSettingsRouter({
          pool: dashboardPool,
          client: this,
        })
      );

      dashboardEnabled = true;
      startupLog('Dashboard routes configured.');
    }

    // Existing health endpoint.
    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || {
        isDegraded: 'unknown',
        connectionType: 'none',
      };

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbStatus.connectionType !== 'none',
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType,
        },
        dashboard: dashboardEnabled,
      });
    });

    // Existing readiness endpoint.
    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || {
        isDegraded: true,
        connectionType: 'none',
      };

      const isReady = this.isReady() && !dbStatus.isDegraded;

      const metrics = {
        guildCount: this.guilds?.cache?.size ?? 0,
        commandCount: this.commands?.size ?? 0,
        database: {
          mode: dbStatus.connectionType,
          degraded: dbStatus.isDegraded,
          degradedReason: dbStatus.degradedReason ?? null,
        },
        schemaVersion: EXPECTED_SCHEMA_VERSION,
        schemaLabel: EXPECTED_SCHEMA_LABEL,
        dashboard: dashboardEnabled,
      };

      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot is fully operational',
          metrics,
        });
      }

      return res.status(503).json({
        ready: false,
        reason: !this.isReady()
          ? 'Bot is connecting to Discord'
          : 'Database connection degraded',
        metrics,
      });
    });

    // Keep the old root response when dashboard configuration is absent.
    if (!dashboardEnabled) {
      app.get('/', (req, res) => {
        res.status(200).json({
          message: 'TitanBot Service Online',
          version: pkg.version,
          timestamp: new Date().toISOString(),
          dashboard: 'disabled',
        });
      });
    }

    // Catch errors in Express routes without exposing stack traces.
    app.use((err, req, res, next) => {
      logger.error('Web request error:', err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    });

    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;

      const server = app.listen(port, host, () => {
        hasStartedListening = true;
        this.webServer = server;

        startupLog(`Web server running on ${host}:${port}`);
        startupLog(`Health endpoint: /health`);
        startupLog(`Ready endpoint: /ready`);

        if (dashboardEnabled) {
          startupLog('Dashboard enabled.');
        }
      });

      server.on('error', (error) => {
        const errorCode = error?.code || 'UNKNOWN_ERROR';

        if (
          !hasStartedListening &&
          errorCode === 'EADDRINUSE' &&
          attempt < maxPortRetryAttempts
        ) {
          const nextPort = port + 1;

          startupLog(
            `Port ${port} in use. Retrying on port ${nextPort}...`
          );

          setTimeout(
            () => startServer(nextPort, attempt + 1),
            250
          );

          return;
        }

        if (hasStartedListening && errorCode === 'EADDRINUSE') {
          logger.warn(`Duplicate bind attempt on ${host}:${port}`);
          return;
        }

        logger.error('Web server error:', error.message);

        if (!hasStartedListening) {
          process.exit(1);
        }
      });
    };

    startServer(configuredPort, 0);
  }

  setupCronJobs() {
    cron.schedule(
      '0 6 * * *',
      runSafeTask('birthday_check', () => checkBirthdays(this))
    );

    cron.schedule(
      '* * * * *',
      runSafeTask('giveaway_check', () => checkGiveaways(this))
    );

    cron.schedule(
      '*/15 * * * *',
      runSafeTask('counter_update', () => this.updateAllCounters())
    );
  }

  async updateAllCounters() {
    if (!this.db) {
      logger.warn('Database unavailable for server counter updates');
      return;
    }

    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const validCounters = [];
        const orphanedCounters = [];

        for (const counter of counters) {
          if (
            counter &&
            counter.type &&
            counter.channelId &&
            counter.enabled !== false
          ) {
            const channel = guild.channels.cache.get(counter.channelId);

            if (channel) {
              validCounters.push(counter);
              await updateCounter(this, guild, counter);
            } else {
              orphanedCounters.push(counter);
            }
          }
        }

        if (orphanedCounters.length > 0) {
          await saveServerCounters(this, guildId, validCounters);

          logger.info(
            `Pruned ${orphanedCounters.length} deleted channel ` +
            `counter(s) in guild ${guildId}`
          );
        }
      } catch (error) {
        logger.error(
          `Error updating counters for guild ${guildId}:`,
          error
        );
      }
    }
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', required: true },
      { path: 'interactions', required: true },
    ];

    for (const handler of handlers) {
      try {
        startupLog(`Loading handler: ${handler.path}`);

        const module = await import(
          `./handlers/loaders/${handler.path}.js`
        );

        const loaderFn = module.default;

        if (typeof loaderFn === 'function') {
          await loaderFn(this);
          startupLog(`Loaded ${handler.path}`);
        } else {
          throw new Error(
            `Invalid export in handler ${handler.path}`
          );
        }
      } catch (error) {
        if (handler.required) {
          logger.error(
            `Failed to load handler ${handler.path}:`,
            error.message
          );

          throw error;
        }
      }
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, {
        clientId: this.config.bot.clientId,
      });
    } catch (error) {
      logger.error('Error registering slash commands:', error);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    shutdownLog(`Bot shutting down (${reason})...`);

    logger.info('Graceful teardown initiated.');

    try {
      logger.info('Stopping scheduled tasks...');
      cron.getTasks().forEach((task) => task.stop());

      logger.info('Stopping music instances...');
      await shutdownMusic(this).catch((error) =>
        logger.warn('Music shutdown notice:', error.message)
      );

      if (this.webServer) {
        logger.info('Stopping HTTP server...');

        await new Promise((resolve) => {
          this.webServer.close(resolve);
        });
      }

      if (this.db?.db?.pool) {
        logger.info('Closing database connections...');

        await this.db.db.pool.end().catch((error) =>
          logger.warn('Database pool end notice:', error.message)
        );
      }

      logger.info('Destroying Discord client...');

      if (this.isReady()) {
        this.destroy();
      }

      logger.info('Teardown complete.');
      shutdownLog('Bot stopped successfully.');

      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();

  process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
  process.on('SIGINT', () => bot.shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    handleTaskError('uncaught_exception', error, { fatal: true });
    bot.shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    const code = reason?.code;

    if ([10062, 40060, 50027].includes(code)) {
      logger.warn(
        'Recoverable interaction error:',
        reason?.message || reason
      );
      return;
    }

    if (reason?.message?.includes('Queue is empty')) {
      return;
    }

    handleTaskError(
      'unhandled_rejection',
      reason instanceof Error
        ? reason
        : new Error(String(reason)),
      {
        errorCode: ErrorCodes.UNHANDLED_REJECTION,
      }
    );
  });

  bot.start().catch((error) => {
    logger.error('Fatal startup failure:', error);
    bot.shutdown('STARTUP_ERROR');
  });
} catch (error) {
  logger.error('Fatal initialization error:', error);
  process.exit(1);
}

export default TitanBot;
