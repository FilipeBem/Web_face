// Gera um código de sala curto e legível (ex: azul-tigre-42)
function gerarCodigoSala() {
  // 5 caracteres, letras (sempre maiúsculas) e números.
  // Evitamos 0/O, 1/I/L (fáceis de confundir ao digitar o código à mão).
  const caracteres = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 5; i++) {
    codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return codigo;
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

  function mostrarErro(msg, campo) {
    erroEl.textContent = msg;
    erroEl.classList.remove("hidden");
    if (campo) {
      campo.focus();
      campo.style.borderColor = "#f87171";
      campo.addEventListener(
        "input",
        () => {
          campo.style.borderColor = "";
          erroEl.classList.add("hidden");
        },
        { once: true }
      );
    }
  }

  function pegarNome() {
    const nome = nomeInput.value.trim();
    if (!nome) {
      mostrarErro("Digite seu nome para continuar.", nomeInput);
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
      mostrarErro("Cole o link ou código da sala.", linkInput);
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

    // Códigos de sala são sempre em maiúsculas — normaliza caso a
    // pessoa tenha digitado em minúsculas.
    codigo = codigo.trim().toUpperCase();

    irParaSala(codigo, nome);
  });
});
