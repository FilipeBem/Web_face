// Gera um código de sala curto e legível (ex: azul-tigre-42)
function gerarCodigoSala() {
  const adjetivos = ["azul", "verde", "rapido", "calmo", "novo", "alto", "leve", "vivo"];
  const substantivos = ["tigre", "rio", "monte", "vento", "sol", "lua", "campo", "farol"];
  const a = adjetivos[Math.floor(Math.random() * adjetivos.length)];
  const s = substantivos[Math.floor(Math.random() * substantivos.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${a}-${s}-${n}`;
}

function irParaSala(codigo, nome) {
  const params = new URLSearchParams({ sala: codigo, nome: nome });
  window.location.href = `room.html?${params.toString()}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const nomeInput = document.getElementById("nome-input");
  const criarBtn = document.getElementById("criar-sala-btn");
  const linkInput = document.getElementById("link-input");
  const entrarBtn = document.getElementById("entrar-sala-btn");
  const erroEl = document.getElementById("erro-msg");

  function pegarNome() {
    const nome = nomeInput.value.trim();
    if (!nome) {
      nomeInput.focus();
      erroEl.textContent = "Digite seu nome para continuar.";
      erroEl.classList.remove("hidden");
      return null;
    }
    erroEl.classList.add("hidden");
    return nome;
  }

  criarBtn.addEventListener("click", () => {
    const nome = pegarNome();
    if (!nome) return;
    const codigo = gerarCodigoSala();
    irParaSala(codigo, nome);
  });

  entrarBtn.addEventListener("click", () => {
    const nome = pegarNome();
    if (!nome) return;

    let valor = linkInput.value.trim();
    if (!valor) {
      erroEl.textContent = "Cole o link ou código da sala.";
      erroEl.classList.remove("hidden");
      return;
    }

    // Aceita tanto um link completo quanto só o código da sala
    let codigo = valor;
    try {
      if (valor.includes("room.html")) {
        const url = new URL(valor, window.location.href);
        codigo = url.searchParams.get("sala") || valor;
      }
    } catch (e) {
      // valor não é uma URL válida, tratamos como código puro
    }

    irParaSala(codigo, nome);
  });
});
