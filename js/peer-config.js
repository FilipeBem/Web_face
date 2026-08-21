// Como não temos um servidor próprio (site estático no GitHub Pages),
// usamos "vagas" numeradas dentro da sala. Cada pessoa ocupa a primeira
// vaga livre (slot 1 a MAX_PARTICIPANTES) e usa isso como seu ID no PeerJS.
const MAX_PARTICIPANTES = 8;

function slotParaId(codigoSala, slot) {
  // Sanitiza o código da sala pra não quebrar o formato de ID do PeerJS
  const seguro = codigoSala.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `sala-${seguro}-vaga${slot}`;
}

// ---------------------------------------------------------
// Servidores de rede (STUN/TURN)
//
// STUN sozinho só funciona quando as duas pessoas estão em redes
// "abertas" o bastante pra se enxergarem direto. Celulares em dados
// móveis costumam estar atrás de uma rede que EXIGE um servidor
// retransmissor (TURN) — sem ele, a chamada nunca fecha com essas redes,
// mesmo que funcione perfeitamente entre dois computadores.
//
// Para resolver isso definitivamente:
// 1) Crie uma conta gratuita em https://www.metered.ca/tools/openrelay/
// 2) No painel, copie o array "iceServers" que eles geram pra você
// 3) Cole ele aqui embaixo, substituindo o array de exemplo (só com STUN)
//
// Sem TURN configurado, o app funciona bem entre redes "compatíveis"
// (a maioria das redes domésticas/wifi), mas pode falhar especificamente
// com celulares em 4G/5G ou redes corporativas restritas.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },

  // Exemplo de como fica depois de colar suas credenciais do Metered/Open Relay:
  // { urls: "turn:standard.relay.metered.ca:80", username: "SEU_USUARIO", credential: "SUA_SENHA" },
  // { urls: "turn:standard.relay.metered.ca:443", username: "SEU_USUARIO", credential: "SUA_SENHA" },
  // { urls: "turn:standard.relay.metered.ca:443?transport=tcp", username: "SEU_USUARIO", credential: "SUA_SENHA" },
];
