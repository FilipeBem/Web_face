// ---------------------------------------------------------
// Estado geral
// ---------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const codigoSala = params.get("sala") || "sala-sem-nome";
const meuNome = params.get("nome") || "Convidado";

let meuPeer = null;
let meuSlot = null;
let meuStream = null;
let micLigado = true;
let camLigada = true;

// Compartilhamento de tela
let streamTela = null;
let compartilhandoTela = false;

// slotId -> { mediaConn, dataConn, nome }
const participantes = new Map();

// ---------------------------------------------------------
// Elementos da tela
// ---------------------------------------------------------
const grid = document.getElementById("video-grid");
const participantCountEl = document.getElementById("participant-count");

function atualizarContadorParticipantes() {
  const total = grid.querySelectorAll(".video-tile").length;
  participantCountEl.textContent = total === 1 ? "1 participante" : `${total} participantes`;
}
const statusEl = document.getElementById("room-status");
const tituloEl = document.getElementById("room-title");
const subtituloEl = document.getElementById("room-sub");
const copyBtn = document.getElementById("copy-link-btn");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screenshare-btn");
const leaveBtn = document.getElementById("leave-btn");

const preJoinGate = document.getElementById("pre-join-gate");
const roomShell = document.getElementById("room-shell");
const ativarMidiaBtn = document.getElementById("ativar-midia-btn");
const preJoinErro = document.getElementById("pre-join-erro");

tituloEl.textContent = `Sala: ${codigoSala}`;
subtituloEl.textContent = `Você entrou como ${meuNome}`;

function mostrarStatus(msg, tipo) {
  statusEl.textContent = msg;
  statusEl.classList.remove("hidden", "error");
  if (tipo === "error") statusEl.classList.add("error");
}
function esconderStatus() {
  statusEl.classList.add("hidden");
}

// ---------------------------------------------------------
// Iniciais / avatar de fallback
// ---------------------------------------------------------
function iniciais(nome) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

// ---------------------------------------------------------
// Reprodução em dispositivos móveis
// ---------------------------------------------------------
// Navegadores móveis (principalmente Safari no iPhone) bloqueiam a
// reprodução automática de vídeo com áudio sem uma interação direta da
// pessoa. Tentamos tocar o vídeo assim que ele chega e, se o navegador
// bloquear, guardamos ele pra tentar de novo no primeiro toque na tela.
const videosPendentesDeReproducao = new Set();
let avisoReproducaoMostrado = false;

function tentarReproduzir(video) {
  const promessa = video.play();
  if (promessa && typeof promessa.catch === "function") {
    promessa.catch(() => {
      videosPendentesDeReproducao.add(video);
      if (!avisoReproducaoMostrado) {
        avisoReproducaoMostrado = true;
        mostrarStatus("Toque em qualquer lugar da tela para ativar o vídeo dos participantes.");
      }
    });
  }
}

function destravarReproducaoPendente() {
  if (videosPendentesDeReproducao.size === 0) return;
  videosPendentesDeReproducao.forEach((video) => {
    video
      .play()
      .then(() => videosPendentesDeReproducao.delete(video))
      .catch(() => {});
  });
  if (videosPendentesDeReproducao.size === 0) {
    avisoReproducaoMostrado = false;
    esconderStatus();
  }
}
document.addEventListener("click", destravarReproducaoPendente);
document.addEventListener("touchend", destravarReproducaoPendente);

// ---------------------------------------------------------
// Criação dos tiles de vídeo
// ---------------------------------------------------------
function criarTile({ id, nome, stream, local }) {
  const tile = document.createElement("div");
  tile.className = "video-tile" + (local ? " is-local" : "");
  tile.dataset.tileId = id;
  tile.dataset.nome = nome;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  if (local) video.muted = true;
  if (stream) video.srcObject = stream;
  tile.appendChild(video);
  tentarReproduzir(video);

  const temVideo = !!stream && stream.getVideoTracks().length > 0;
  tile.classList.toggle("has-video", temVideo);

  const avatar = document.createElement("div");
  avatar.className = "no-video-fallback";
  avatar.textContent = iniciais(nome) || "?";
  tile.appendChild(avatar);

  const nameTag = document.createElement("span");
  nameTag.className = "tile-name-tag";
  nameTag.textContent = local ? `${nome} (você)` : nome;
  tile.appendChild(nameTag);

  const micBadge = document.createElement("div");
  micBadge.className = "tile-mic-badge";
  micBadge.innerHTML = svgMic();
  tile.appendChild(micBadge);

  const expandBtn = document.createElement("button");
  expandBtn.className = "tile-expand-btn";
  expandBtn.title = "Tela cheia";
  expandBtn.type = "button";
  expandBtn.innerHTML = svgExpandir();
  expandBtn.addEventListener("click", (evento) => {
    evento.stopPropagation();
    alternarTelaCheia(tile);
  });
  tile.appendChild(expandBtn);

  // Engrenagem de volume — só em participantes remotos, e só afeta
  // o áudio deles NO SEU aparelho (nunca muda nada pros outros).
  if (!local) {
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "tile-settings-btn";
    settingsBtn.title = "Volume";
    settingsBtn.type = "button";
    settingsBtn.innerHTML = svgEngrenagem();
    settingsBtn.addEventListener("click", (evento) => {
      evento.stopPropagation();
      alternarMenuVolume(settingsBtn, video, nome, tile.dataset.tileId);
    });
    tile.appendChild(settingsBtn);
  }
  grid.appendChild(tile);
  atualizarContadorParticipantes();
  return tile;
}

function removerTile(id) {
  const tile = grid.querySelector(`[data-tile-id="${CSS.escape(id)}"]`);
  if (tile) {
    if (tile.classList.contains("is-expanded")) colapsarTelaCheia(tile);
    tile.remove();
    atualizarContadorParticipantes();
  }
  if (volumeMenu.dataset.targetTile === id) fecharMenuVolume();
}

function svgMic() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/>
    <path d="M19 11a7 7 0 0 1-14 0"/>
    <path d="M12 18v3"/>
  </svg>`;
}

function svgExpandir() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4"/>
  </svg>`;
}

function svgRecolher() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
  </svg>`;
}

function svgEngrenagem() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  </svg>`;
}

// ---------------------------------------------------------
// Tela cheia de um card (câmera ou compartilhamento)
// ---------------------------------------------------------
const tileBackdrop = document.getElementById("tile-backdrop");

function alternarTelaCheia(tile) {
  const jaExpandido = tile.classList.contains("is-expanded");

  // Só um card expandido por vez
  grid.querySelectorAll(".video-tile.is-expanded").forEach((outro) => {
    if (outro !== tile) colapsarTelaCheia(outro);
  });

  jaExpandido ? colapsarTelaCheia(tile) : expandirTelaCheia(tile);
}

function expandirTelaCheia(tile) {
  tile.classList.add("is-expanded");
  tileBackdrop.classList.remove("hidden");
  const btn = tile.querySelector(".tile-expand-btn");
  if (btn) btn.innerHTML = svgRecolher();
}

function colapsarTelaCheia(tile) {
  tile.classList.remove("is-expanded");
  tileBackdrop.classList.add("hidden");
  const btn = tile.querySelector(".tile-expand-btn");
  if (btn) btn.innerHTML = svgExpandir();
}

tileBackdrop.addEventListener("click", () => {
  const expandido = grid.querySelector(".video-tile.is-expanded");
  if (expandido) colapsarTelaCheia(expandido);
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") {
    const expandido = grid.querySelector(".video-tile.is-expanded");
    if (expandido) colapsarTelaCheia(expandido);
  }
});

// ---------------------------------------------------------
// Volume por participante (engrenagem no canto superior esquerdo)
//
// Importante: isso SÓ muda o volume no seu próprio aparelho. Cada
// pessoa na sala tem seu próprio controle, independente dos outros —
// se Pedro abaixa o volume de Ana, isso não muda nada para Lucas.
// ---------------------------------------------------------
const volumeMenu = document.getElementById("volume-menu");
const volumeMenuNome = document.getElementById("volume-menu-name");
const volumeMenuSlider = document.getElementById("volume-menu-slider");
const volumeMenuMuteBtn = document.getElementById("volume-menu-mute");

let videoDoMenuAtivo = null;
let botaoDoMenuAtivo = null;

function posicionarMenuVolume(botao) {
  const retangulo = botao.getBoundingClientRect();
  const larguraMenu = 220;
  const alturaMenu = 150;
  let esquerda = retangulo.left;
  let topo = retangulo.bottom + 8;

  if (esquerda + larguraMenu > window.innerWidth - 12) {
    esquerda = window.innerWidth - larguraMenu - 12;
  }
  if (topo + alturaMenu > window.innerHeight - 12) {
    topo = retangulo.top - alturaMenu - 8;
  }
  volumeMenu.style.left = `${Math.max(12, esquerda)}px`;
  volumeMenu.style.top = `${Math.max(12, topo)}px`;
}

function alternarMenuVolume(botao, video, nome, tileId) {
  const jaAberto = !volumeMenu.classList.contains("hidden") && botaoDoMenuAtivo === botao;
  if (jaAberto) {
    fecharMenuVolume();
    return;
  }

  videoDoMenuAtivo = video;
  botaoDoMenuAtivo = botao;
  volumeMenu.dataset.targetTile = tileId;
  volumeMenuNome.textContent = nome;
  volumeMenuSlider.value = Math.round((video.muted ? 0 : video.volume) * 100);
  volumeMenuMuteBtn.textContent = video.muted ? "Reativar som" : "Silenciar";

  posicionarMenuVolume(botao);
  volumeMenu.classList.remove("hidden");
}

function fecharMenuVolume() {
  volumeMenu.classList.add("hidden");
  volumeMenu.dataset.targetTile = "";
  videoDoMenuAtivo = null;
  botaoDoMenuAtivo = null;
}

volumeMenuSlider.addEventListener("input", () => {
  if (!videoDoMenuAtivo) return;
  const v = Number(volumeMenuSlider.value) / 100;
  videoDoMenuAtivo.volume = v;
  videoDoMenuAtivo.muted = v === 0;
  volumeMenuMuteBtn.textContent = videoDoMenuAtivo.muted ? "Reativar som" : "Silenciar";
});

volumeMenuMuteBtn.addEventListener("click", () => {
  if (!videoDoMenuAtivo) return;
  videoDoMenuAtivo.muted = !videoDoMenuAtivo.muted;
  volumeMenuMuteBtn.textContent = videoDoMenuAtivo.muted ? "Reativar som" : "Silenciar";
});

document.addEventListener("click", (evento) => {
  if (
    !volumeMenu.contains(evento.target) &&
    !evento.target.closest(".tile-settings-btn")
  ) {
    fecharMenuVolume();
  }
});
window.addEventListener("resize", fecharMenuVolume);
window.addEventListener("scroll", fecharMenuVolume, true);


// ---------------------------------------------------------
// 1) Pega câmera/microfone locais
// ---------------------------------------------------------

// Traduz o erro do navegador numa mensagem que a pessoa entende e sabe resolver.
function mensagemDeErroMidia(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "O acesso à câmera/microfone foi bloqueado. Clique no ícone de cadeado (ou câmera) ao lado do endereço do site, permita o acesso e tente de novo.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Não encontrei uma câmera ou microfone neste dispositivo. Conecte um e tente novamente.";
    case "NotReadableError":
    case "TrackStartError":
      return "Sua câmera ou microfone já está sendo usada por outro aplicativo ou aba. Feche o que estiver usando e tente de novo.";
    case "OverconstrainedError":
      return "A câmera/microfone deste dispositivo não atendeu aos requisitos. Tente novamente.";
    case "SecurityError":
      return "O navegador bloqueou o acesso por motivos de segurança. Confirme que o site está sendo acessado por https:// e tente novamente.";
    default:
      return "Não consegui acessar sua câmera/microfone. Verifique as permissões do navegador e tente novamente.";
  }
}

async function iniciarMidiaLocal() {
  try {
    // Tenta câmera + microfone juntos
    meuStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return { ok: true };
  } catch (errCompleto) {
    // Se falhar, tenta só o microfone (pode ser que só a câmera esteja indisponível)
    try {
      meuStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      return { ok: true, semCamera: true };
    } catch {
      return { ok: false, err: errCompleto };
    }
  }
}

async function tentarAtivarMidia() {
  ativarMidiaBtn.disabled = true;
  ativarMidiaBtn.textContent = "Pedindo permissão...";
  preJoinErro.classList.add("hidden");

  const resultado = await iniciarMidiaLocal();

  if (!resultado.ok) {
    ativarMidiaBtn.disabled = false;
    ativarMidiaBtn.textContent = "Tentar novamente";
    preJoinErro.textContent = mensagemDeErroMidia(resultado.err);
    preJoinErro.classList.remove("hidden");
    return;
  }

  // Sucesso: libera a sala
  preJoinGate.classList.add("hidden");
  roomShell.classList.remove("hidden");

  criarTile({ id: "local", nome: meuNome, stream: meuStream, local: true });

  if (resultado.semCamera) {
    camBtn.disabled = true;
    camBtn.classList.add("off");
    mostrarStatus(
      "Você entrou só com áudio (a câmera não pôde ser usada). Ainda é possível compartilhar sua tela normalmente.",
      null
    );
  } else {
    mostrarStatus("Procurando outros participantes na sala...");
  }

  registrarNaSala(1);
}

ativarMidiaBtn.addEventListener("click", tentarAtivarMidia);

// ---------------------------------------------------------
// 2) Registra meu Peer numa vaga livre da sala
// ---------------------------------------------------------
function registrarNaSala(slot = 1) {
  if (slot > MAX_PARTICIPANTES) {
    mostrarStatus("Essa sala já está cheia (máximo de 8 participantes).", "error");
    return;
  }

  const idTentativa = slotParaId(codigoSala, slot);
  const peer = new Peer(idTentativa);

  peer.on("open", () => {
    meuPeer = peer;
    meuSlot = slot;
    esconderStatus();
    conectarComOutros();
    escutarConexoesRecebidas();
  });

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      peer.destroy();
      registrarNaSala(slot + 1);
    } else if (err.type === "peer-unavailable") {
      // Esperado: tentamos falar com uma vaga vazia. Ignora.
    } else {
      console.warn("Erro de conexão:", err);
    }
  });
}

// ---------------------------------------------------------
// 3) Ao entrar, tenta se conectar com quem já está na sala
// ---------------------------------------------------------
function conectarComOutros() {
  for (let slot = 1; slot <= MAX_PARTICIPANTES; slot++) {
    if (slot === meuSlot) continue;
    const idAlvo = slotParaId(codigoSala, slot);

    const chamada = meuPeer.call(idAlvo, meuStream, {
      metadata: { nome: meuNome },
    });
    if (chamada) {
      chamada.on("stream", (streamRemoto) => {
        adicionarParticipante(idAlvo, meuNome, chamada, streamRemoto);
      });
      aplicarTracksAtuais(chamada);
    }

    const conexaoDados = meuPeer.connect(idAlvo, {
      metadata: { nome: meuNome },
      reliable: true,
    });
    configurarConexaoDados(idAlvo, conexaoDados);
  }
}

// ---------------------------------------------------------
// 4) Escuta quem chega depois e se conecta comigo
// ---------------------------------------------------------
function escutarConexoesRecebidas() {
  meuPeer.on("call", (chamada) => {
    const nomeRemoto = chamada.metadata?.nome || "Participante";
    chamada.answer(meuStream);
    chamada.on("stream", (streamRemoto) => {
      adicionarParticipante(chamada.peer, nomeRemoto, chamada, streamRemoto);
    });
    aplicarTracksAtuais(chamada);
  });

  meuPeer.on("connection", (conexao) => {
    configurarConexaoDados(conexao.peer, conexao);
  });
}

function configurarConexaoDados(idRemoto, conexao) {
  conexao.on("open", () => {
    const info = participantes.get(idRemoto) || {};
    info.dataConn = conexao;
    participantes.set(idRemoto, info);
  });

  conexao.on("data", (dado) => {
    if (dado && dado.tipo === "chat") {
      const nomeRemoto = participantes.get(idRemoto)?.nome || dado.nome || "Participante";
      renderizarMensagem({ nome: nomeRemoto, texto: dado.texto, own: false });
    }
  });

  conexao.on("close", () => {
    participantes.delete(idRemoto);
    removerTile(idRemoto);
  });
}

function adicionarParticipante(idRemoto, nome, mediaConn, stream) {
  const existente = participantes.get(idRemoto);
  if (existente && existente.tileCriado) return; // evita tile duplicado

  criarTile({ id: idRemoto, nome, stream, local: false });
  participantes.set(idRemoto, {
    ...(existente || {}),
    mediaConn,
    nome,
    tileCriado: true,
  });
}

// ---------------------------------------------------------
// Compartilhamento de tela
// ---------------------------------------------------------
let audioCompartilhado = null; // { ctx, track } — mistura mic + áudio da tela, se houver

// Retorna a faixa de vídeo que devemos estar enviando agora:
// a da tela (se estiver compartilhando) ou a da câmera.
function trackDeVideoAtual() {
  if (compartilhandoTela && streamTela) {
    return streamTela.getVideoTracks()[0];
  }
  return meuStream.getVideoTracks()[0];
}

// Retorna a faixa de áudio a enviar: o microfone sozinho, ou o
// microfone misturado com o áudio da tela (se o navegador cedeu esse áudio).
function trackDeAudioAtual() {
  if (compartilhandoTela && audioCompartilhado) {
    return audioCompartilhado.track;
  }
  return meuStream.getAudioTracks()[0];
}

// Troca as faixas de vídeo/áudio enviadas numa chamada específica, sem
// precisar refazer a conexão (renegociação silenciosa do WebRTC).
function aplicarTracksAtuais(mediaConn) {
  const pc = mediaConn?.peerConnection;
  if (!pc) return;
  const senders = pc.getSenders();

  const remetenteVideo = senders.find((s) => s.track && s.track.kind === "video");
  const novaVideo = trackDeVideoAtual();
  if (remetenteVideo && novaVideo) {
    remetenteVideo.replaceTrack(novaVideo).catch((err) => console.warn("Falha ao trocar vídeo:", err));
  }

  const remetenteAudio = senders.find((s) => s.track && s.track.kind === "audio");
  const novaAudio = trackDeAudioAtual();
  if (remetenteAudio && novaAudio) {
    remetenteAudio.replaceTrack(novaAudio).catch((err) => console.warn("Falha ao trocar áudio:", err));
  }
}

function aplicarTracksParaTodos() {
  participantes.forEach((info) => {
    if (info.mediaConn) aplicarTracksAtuais(info.mediaConn);
  });
}

function atualizarTileLocal(stream, rotulo) {
  const tile = document.querySelector('.video-tile[data-tile-id="local"]');
  if (!tile) return;
  const video = tile.querySelector("video");
  if (video) video.srcObject = stream;
  const temVideo = !!stream && stream.getVideoTracks().length > 0;
  tile.classList.toggle("has-video", temVideo);
  const nameTag = tile.querySelector(".tile-name-tag");
  if (nameTag) nameTag.textContent = rotulo;
}

async function iniciarCompartilhamento() {
  try {
    // Pedimos vídeo + áudio da tela. Em muitos navegadores, o áudio só
    // vem se a pessoa marcar "Compartilhar áudio" na caixa de seleção
    // (e normalmente só funciona ao compartilhar uma aba, não a tela toda).
    streamTela = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch {
    // Usuário cancelou a seleção de tela/janela. Não faz nada.
    return;
  }

  compartilhandoTela = true;
  screenBtn.classList.add("active");
  camBtn.disabled = true;

  const audioDaTela = streamTela.getAudioTracks()[0] || null;
  if (audioDaTela) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const destino = ctx.createMediaStreamDestination();
      const micTrack = meuStream.getAudioTracks()[0];
      if (micTrack) ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(destino);
      ctx.createMediaStreamSource(new MediaStream([audioDaTela])).connect(destino);
      audioCompartilhado = { ctx, track: destino.stream.getAudioTracks()[0] };
    } catch (err) {
      console.warn("Não foi possível misturar o áudio da tela com o microfone:", err);
      audioCompartilhado = null;
    }
  }

  atualizarTileLocal(streamTela, "Você (compartilhando tela)");
  aplicarTracksParaTodos();

  // Se o usuário parar pelo botão nativo do navegador ("Parar compartilhamento"),
  // detectamos aqui e voltamos pra câmera automaticamente.
  streamTela.getVideoTracks()[0].addEventListener("ended", pararCompartilhamento);
}

function pararCompartilhamento() {
  if (!compartilhandoTela) return;

  if (streamTela) streamTela.getTracks().forEach((t) => t.stop());
  streamTela = null;

  if (audioCompartilhado) {
    audioCompartilhado.ctx.close().catch(() => {});
    audioCompartilhado = null;
  }

  compartilhandoTela = false;
  screenBtn.classList.remove("active");
  camBtn.disabled = false;

  atualizarTileLocal(meuStream, `${meuNome} (você)`);
  aplicarTracksParaTodos();
}

screenBtn.addEventListener("click", () => {
  if (compartilhandoTela) {
    pararCompartilhamento();
  } else {
    iniciarCompartilhamento();
  }
});


// ---------------------------------------------------------
// Chat
// ---------------------------------------------------------
const chatPanel = document.getElementById("chat-panel");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatBtnEl = document.getElementById("chat-btn");
const chatBadge = document.getElementById("chat-badge");

let chatAberto = false;
let naoLidas = 0;

function formatarHora() {
  const agora = new Date();
  return agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderizarMensagem({ nome, texto, own }) {
  const li = document.createElement("li");
  li.className = "chat-msg" + (own ? " own" : "");

  const meta = document.createElement("span");
  meta.className = "chat-msg-meta";
  meta.textContent = `${own ? "Você" : nome} · ${formatarHora()}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-msg-bubble";
  bubble.textContent = texto;

  li.appendChild(meta);
  li.appendChild(bubble);
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!own && !chatAberto) {
    naoLidas++;
    chatBadge.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
    chatBadge.classList.remove("hidden");
  }
}

function abrirChat() {
  chatAberto = true;
  chatPanel.classList.remove("hidden");
  chatBtnEl.classList.add("active");
  naoLidas = 0;
  chatBadge.classList.add("hidden");
  chatInput.focus();
}

function fecharChat() {
  chatAberto = false;
  chatPanel.classList.add("hidden");
  chatBtnEl.classList.remove("active");
}

chatBtnEl.addEventListener("click", () => {
  chatAberto ? fecharChat() : abrirChat();
});
chatCloseBtn.addEventListener("click", fecharChat);

chatForm.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const texto = chatInput.value.trim();
  if (!texto) return;

  participantes.forEach((info) => {
    if (info.dataConn && info.dataConn.open) {
      info.dataConn.send({ tipo: "chat", nome: meuNome, texto });
    }
  });

  renderizarMensagem({ nome: meuNome, texto, own: true });
  chatInput.value = "";
  chatInput.focus();
});

// ---------------------------------------------------------
// Controles (mic / câmera / sair)
// ---------------------------------------------------------
micBtn.addEventListener("click", () => {
  if (!meuStream) return;
  micLigado = !micLigado;
  meuStream.getAudioTracks().forEach((t) => (t.enabled = micLigado));
  micBtn.classList.toggle("off", !micLigado);
});

camBtn.addEventListener("click", () => {
  if (!meuStream) return;
  camLigada = !camLigada;
  meuStream.getVideoTracks().forEach((t) => (t.enabled = camLigada));
  camBtn.classList.toggle("off", !camLigada);
});

leaveBtn.addEventListener("click", () => {
  encerrarTudo();
  window.location.href = "index.html";
});

window.addEventListener("beforeunload", encerrarTudo);

function encerrarTudo() {
  if (meuStream) meuStream.getTracks().forEach((t) => t.stop());
  if (streamTela) streamTela.getTracks().forEach((t) => t.stop());
  if (audioCompartilhado) audioCompartilhado.ctx.close().catch(() => {});
  if (meuPeer) meuPeer.destroy();
}

// ---------------------------------------------------------
// Copiar link da sala
// ---------------------------------------------------------
copyBtn.addEventListener("click", async () => {
  const url = `${window.location.origin}${window.location.pathname.replace(
    "room.html",
    "index.html"
  )}?sala=${encodeURIComponent(codigoSala)}`;
  try {
    await navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(codigoSala)}`
    );
    const textoOriginal = copyBtn.textContent;
    copyBtn.textContent = "Link copiado!";
    setTimeout(() => (copyBtn.textContent = textoOriginal), 1800);
  } catch {
    prompt("Copie o link da sala:", window.location.href);
  }
});

// ---------------------------------------------------------
// A sala só é iniciada quando a pessoa clica em
// "Ativar câmera e microfone" (veja tentarAtivarMidia acima).
// ---------------------------------------------------------
