// Como não temos um servidor próprio (site estático no GitHub Pages),
// usamos "vagas" numeradas dentro da sala. Cada pessoa ocupa a primeira
// vaga livre (slot 1 a MAX_PARTICIPANTES) e usa isso como seu ID no PeerJS.
const MAX_PARTICIPANTES = 8;

function slotParaId(codigoSala, slot) {
  // Sanitiza o código da sala pra não quebrar o formato de ID do PeerJS
  const seguro = codigoSala.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `sala-${seguro}-vaga${slot}`;
}
