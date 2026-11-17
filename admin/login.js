(function () {
    "use strict";

    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    const togglePassword = document.getElementById("togglePassword");
    const message = document.getElementById("loginMessage");
    const button = document.getElementById("loginButton");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = "login-message" + (type ? " is-" + type : "");
    }

    togglePassword.addEventListener("click", function () {
        const isVisible = passwordInput.type === "text";
        passwordInput.type = isVisible ? "password" : "text";
        togglePassword.setAttribute("aria-pressed", String(!isVisible));
        const label = isVisible ? "Tampilkan kata sandi" : "Sembunyikan kata sandi";
        togglePassword.setAttribute("aria-label", label);
        togglePassword.setAttribute("title", label);
    });

    function getSafeDestination() {
        const candidate = new URLSearchParams(window.location.search).get("next") || "/admin/";
        if (!candidate.startsWith("/admin") || candidate.startsWith("//") || candidate.startsWith("/admin/login")) return "/admin/";
        return candidate;
    }

    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (session) {
            if (session && session.authenticated) window.location.replace("/admin/");
            else if (session && !session.configured) showMessage("Login belum diaktifkan. Pengelola perlu menyelesaikan pengaturan di Cloudflare.", "info");
        })
        .catch(function () { showMessage("Tidak dapat memeriksa sesi. Coba muat ulang halaman.", "info"); });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        button.disabled = true;
        button.textContent = "Memeriksa...";
        showMessage("");

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Login gagal. Coba periksa kembali data masuk.");
            window.location.replace(getSafeDestination());
        } catch (error) {
            showMessage(error.message || "Login gagal. Coba lagi.");
            passwordInput.value = "";
            passwordInput.focus();
        } finally {
            button.disabled = false;
            button.textContent = "Masuk";
        }
    });
})();
