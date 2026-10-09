
const $ = selector => document.querySelector(selector);

let csrfToken = "";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET"
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function showStatus(message) {
  const status = $("#status");
  if (status) status.textContent = message;
}

async function loadCsrfToken() {
  const data = await request("/api/settings/csrf");
  csrfToken = data.csrfToken;
}

async function loadServers() {
  const container = $("#servers");
  if (!container) return;

  const data = await request("/api/servers");

  if (!data.servers.length) {
    container.textContent = "No servers found where you have management permissions.";
    return;
  }

  container.innerHTML = data.servers.map(server => `
    <a class="server-card" href="/dashboard.html?guildId=${encodeURIComponent(server.id)}">
      <span class="server-icon">
        ${server.icon
          ? `<img src="${escapeHTML(server.icon)}" alt="">`
          : escapeHTML(server.name.slice(0, 1).toUpperCase())}
      </span>
      <span>
        <strong>${escapeHTML(server.name)}</strong>
        <br>
        <small class="muted">${server.botPresent
          ? "MaherBot connected"
          : "MaherBot not in this server"}</small>
      </span>
    </a>
  `).join("");
}

async function loadSettings() {
  const container = $("#features");
  if (!container) return;

  const guildId = new URLSearchParams(location.search).get("guildId");

  if (!guildId) {
    showStatus("No server selected. Return to the server list.");
    return;
  }

  const data = await request(
    `/api/settings/${encodeURIComponent(guildId)}`
  );

  $("#guild-name").textContent = data.guild.name;

  container.innerHTML = Object.entries(data.features).map(([key, feature]) => `
    <article class="feature">
      <div>
        <h2>${escapeHTML(feature.label)}</h2>
        <p>${escapeHTML(feature.description)}</p>
      </div>
      <input
        class="switch"
        type="checkbox"
        role="switch"
        aria-label="${escapeHTML(feature.label)}"
        data-feature="${escapeHTML(key)}"
        ${data.settings[key] ? "checked" : ""}
      >
    </article>
  `).join("");

  container.querySelectorAll("[data-feature]").forEach(input => {
    input.addEventListener("change", async () => {
      const originalValue = !input.checked;
      input.disabled = true;
      showStatus("Saving…");

      try {
        await request(
          `/api/settings/${encodeURIComponent(guildId)}/${encodeURIComponent(input.dataset.feature)}`,
          {
            method: "PUT",
            body: JSON.stringify({ enabled: input.checked })
          }
        );

        showStatus("Setting saved.");
      } catch (error) {
        input.checked = originalValue;
        showStatus(error.message);
      } finally {
        input.disabled = false;
      }
    });
  });
}

async function init() {
  try {
    const me = await request("/auth/me");

    if (!me.user) {
      if ($("#servers")) {
        $("#servers").innerHTML =
          '<a class="button" href="/auth/discord">Sign in with Discord</a>';
      } else {
        location.href = "/login.html";
      }
      return;
    }

    await loadCsrfToken();

    if ($("#servers")) {
      await loadServers();
    } else if ($("#features")) {
      await loadSettings();
    }
  } catch (error) {
    showStatus(error.message);
    const servers = $("#servers");
    if (servers) {
      servers.textContent = error.message;
    }
  }
}

init();
