const supabaseClient = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const authContainer = document.getElementById("admin-auth");

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) {
    showAdmin(session.user);
  }

  if (event === "SIGNED_OUT") {
    showLogin();
  }
});

async function initAdmin() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session) {
    showAdmin(session.user);
  } else {
    showLogin();
  }
}

function showLogin() {
  authContainer.innerHTML = `
    <div class="admin-card">

      <h2>Anmelden</h2>

      <form id="admin-login-form">

        <label>
          E-Mail
          <input
            type="email"
            id="admin-email"
            required
            autocomplete="email"
          >
        </label>

        <label>
          Passwort
          <input
            type="password"
            id="admin-password"
            required
            autocomplete="current-password"
          >
        </label>

        <button type="submit">
          Anmelden
        </button>

        <p id="admin-login-message"></p>

      </form>

    </div>
  `;

  document
    .getElementById("admin-login-form")
    .addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();

  const email =
    document.getElementById("admin-email").value;

  const password =
    document.getElementById("admin-password").value;

  const message =
    document.getElementById("admin-login-message");

  message.textContent = "Anmeldung läuft …";

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    console.error(error);
    message.textContent = "Anmeldung fehlgeschlagen.";
    return;
  }

  showAdmin(data.user);
}

function showAdmin(user) {
  authContainer.innerHTML = `
    <div class="admin-card">

      <span class="eyebrow">Angemeldet</span>

      <h2>Essensplan verwalten</h2>

      <p>
        Angemeldet als ${user.email}
      </p>

      <div class="admin-upload-section">

        <h3>Neuen Essensplan hochladen</h3>

        <p>
          Laden Sie hier die PDF-Datei des Caterers hoch.
        </p>

        <form id="meal-plan-upload-form">

          <label>
            PDF auswählen

            <input
              type="file"
              id="meal-plan-file"
              accept="application/pdf"
              required
            >
          </label>

          <button type="submit">
            Essensplan veröffentlichen
          </button>

          <p id="meal-plan-upload-message"></p>

        </form>

      </div>

      <div class="admin-password-section">

        <h3>Passwort ändern</h3>

        <form id="admin-password-form">

          <label>
            Neues Passwort

            <input
              type="password"
              id="admin-new-password"
              minlength="8"
              required
              autocomplete="new-password"
            >
          </label>

          <button type="submit">
            Passwort speichern
          </button>

          <p id="admin-password-message"></p>

        </form>

      </div>

      <button
        id="admin-logout"
        type="button"
      >
        Abmelden
      </button>

    </div>
  `;

  document
    .getElementById("meal-plan-upload-form")
    .addEventListener("submit", uploadMealPlan);

  document
    .getElementById("admin-password-form")
    .addEventListener("submit", updatePassword);

  document
    .getElementById("admin-logout")
    .addEventListener("click", logout);
}

async function uploadMealPlan(event) {
  event.preventDefault();

  const fileInput =
    document.getElementById("meal-plan-file");

  const message =
    document.getElementById("meal-plan-upload-message");

  const file = fileInput.files[0];

  if (!file) {
    message.textContent =
      "Bitte eine PDF-Datei auswählen.";
    return;
  }

  if (file.type !== "application/pdf") {
    message.textContent =
      "Bitte nur PDF-Dateien hochladen.";
    return;
  }

  message.textContent =
    "Essensplan wird hochgeladen …";

  const safeFileName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();

  const timestamp = Date.now();

  const filePath =
    `uploads/${timestamp}-${safeFileName}`;

  const { error: uploadError } =
    await supabaseClient.storage
      .from("meal-plans")
      .upload(filePath, file, {
        contentType: "application/pdf",
        upsert: false
      });

  if (uploadError) {
    console.error(uploadError);

    message.textContent =
      "Upload fehlgeschlagen.";

    return;
  }

  const { error: updateError } =
    await supabaseClient
      .from("meal_plans")
      .update({
        is_current: false
      })
      .eq("is_current", true);

  if (updateError) {
    console.error(updateError);

    message.textContent =
      "PDF wurde hochgeladen, aber der alte Essensplan konnte nicht deaktiviert werden.";

    return;
  }

  const { error: insertError } =
    await supabaseClient
      .from("meal_plans")
      .insert({
        file_name: safeFileName,
        file_path: filePath,
        is_current: true
      });

  if (insertError) {
    console.error(insertError);

    message.textContent =
      "PDF wurde hochgeladen, aber der neue Essensplan konnte nicht gespeichert werden.";

    return;
  }

  message.textContent =
    "Essensplan wurde erfolgreich veröffentlicht.";

  fileInput.value = "";
}

async function updatePassword(event) {
  event.preventDefault();

  const password =
    document.getElementById(
      "admin-new-password"
    ).value;

  const message =
    document.getElementById(
      "admin-password-message"
    );

  message.textContent =
    "Passwort wird gespeichert …";

  const { error } =
    await supabaseClient.auth.updateUser({
      password
    });

  if (error) {
    console.error(error);

    message.textContent =
      "Passwort konnte nicht gespeichert werden.";

    return;
  }

  message.textContent =
    "Passwort wurde gespeichert.";

  document.getElementById(
    "admin-new-password"
  ).value = "";
}

async function logout() {
  await supabaseClient.auth.signOut();
}

initAdmin();