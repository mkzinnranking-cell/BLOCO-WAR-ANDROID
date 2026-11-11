import type { EnemyKind } from "../types";

export interface Dlg { who: string; text: string }
export interface SpawnGroup { kinds: EnemyKind[]; count: number; at: number | "extract" | "start" | "near"; radius?: number; alert?: boolean }
export type TutStep = "move" | "look" | "shoot" | "ads" | "reload" | "switch" | "sprint" | "grenade" | "melee" | "interact";
export interface FxEvent { t: number; explode?: number | "near"; shake?: number }
export interface Objective {
  text: string;
  type: "kill" | "reach" | "survive" | "destroy" | "collect" | "rescue" | "boss" | "tut";
  at?: number | "extract" | "start";
  n?: number; seconds?: number; tut?: TutStep; hint?: string;
  spawns?: SpawnGroup[]; dlg?: Dlg[]; ambush?: SpawnGroup[]; fx?: FxEvent[];
  waves?: { every: number; group: SpawnGroup };
}
export interface Mission {
  id: number; name: string; sub: string; brief: string; map: string; diff: string; par: number; credits: number; xp: number;
  stealth?: boolean; intro: Dlg[]; outro: Dlg[]; objectives: Objective[];
}

const CMD = "Cap. Mendes";
const INT = "Lia (Intel)";
const SGT = "Sgt. Rocha";
const VIL = "Cmdt. Vargas";

export const TUTORIAL: Mission = {
  id: 0, name: "Treinamento Básico", sub: "Tutorial interativo", brief: "Aprenda os controles durante o treinamento.", map: "range", diff: "Fácil", par: 240, credits: 300, xp: 150,
  intro: [{ who: SGT, text: "Bem-vindo ao campo de treinamento, recruta. Vou te ensinar tudo, um passo de cada vez." }],
  outro: [{ who: SGT, text: "Excelente! Você está pronto para o campo de batalha. Boa sorte, soldado." }],
  objectives: [
    { type: "tut", tut: "move", text: "Use o JOYSTICK (esquerda) para andar até a marca", hint: "joy", at: 6, spawns: [] },
    { type: "tut", tut: "look", text: "Deslize o dedo no lado DIREITO da tela para olhar ao redor", hint: "look", n: 160 },
    { type: "tut", tut: "shoot", text: "Segure o botão ATIRAR e acerte 4 alvos", hint: "fire", n: 4 },
    { type: "tut", tut: "ads", text: "Toque em MIRAR para usar a mira e acerte 2 alvos", hint: "ads", n: 2 },
    { type: "tut", tut: "reload", text: "Toque em RECARREGAR", hint: "reload" },
    { type: "tut", tut: "switch", text: "Toque em TROCAR para usar a arma secundária", hint: "switch" },
    { type: "tut", tut: "sprint", text: "Toque em CORRER e corra por 3 segundos", hint: "sprint", seconds: 3 },
    { type: "tut", tut: "melee", text: "Toque no botão de CORPO A CORPO", hint: "melee" },
    { type: "tut", tut: "grenade", text: "Toque em GRANADA para arremessar uma", hint: "grenade" },
    { type: "tut", tut: "interact", text: "Chegue ao console brilhante e toque em INTERAGIR", hint: "interact", at: 12 },
    { type: "kill", text: "Elimine os 3 alvos hostis móveis", n: 3, spawns: [{ kinds: ["grunt"], count: 3, at: "extract", radius: 4 }], dlg: [{ who: SGT, text: "Agora alvos reais! Eles revidam. Use cobertura e mire na cabeça." }] },
    { type: "reach", text: "Vá até o ponto de extração", at: "extract" },
  ],
};

export const MISSIONS: Mission[] = [
  {
    id: 1, name: "Primeiro Contato", sub: "Base Militar — Setor Alfa", brief: "A Legião Ébano invadiu o perímetro da Base Alfa. Limpe a área e recupere o controle.", map: "base", diff: "Fácil", par: 300, credits: 400, xp: 200,
    intro: [{ who: CMD, text: "Operação Aurora Negra começa agora. A Legião Ébano tomou a Base Alfa." }, { who: CMD, text: "Entre, elimine a resistência e avance até a extração. Sem heroísmos." }],
    outro: [{ who: CMD, text: "Setor Alfa limpo. Mas encontramos um mapa... eles estão atrás do Projeto Vértice." }],
    objectives: [
      { type: "reach", text: "Avance até o primeiro hangar", at: 2 },
      { type: "kill", text: "Elimine os inimigos da área", n: 6, spawns: [{ kinds: ["grunt"], count: 4, at: 3 }, { kinds: ["smg"], count: 2, at: 4 }], dlg: [{ who: SGT, text: "Contato à frente! Usem as caixas como cobertura." }] },
      { type: "reach", text: "Chegue ao ponto de extração", at: "extract", fx: [{ t: 2, explode: "near", shake: 0.6 }] },
    ],
  },
  {
    id: 2, name: "Território Hostil", sub: "Cidade Abandonada", brief: "Atravesse a cidade tomada pelo inimigo e elimine as patrulhas.", map: "city", diff: "Normal", par: 360, credits: 550, xp: 280,
    intro: [{ who: INT, text: "Detectei movimentação do inimigo no centro da cidade. Eles têm atiradores nos telhados." }],
    outro: [{ who: INT, text: "Rota liberada. O sinal do Projeto Vértice vem do leste." }],
    objectives: [
      { type: "kill", text: "Elimine a primeira patrulha", n: 5, spawns: [{ kinds: ["grunt", "smg"], count: 5, at: 2 }] },
      { type: "reach", text: "Cruze a praça central", at: 5, ambush: [{ kinds: ["smg", "grunt"], count: 3, at: "near", radius: 18, alert: true }], dlg: [{ who: SGT, text: "Emboscada! Eles saíram dos prédios!" }] },
      { type: "kill", text: "Elimine os reforços inimigos", n: 7, spawns: [{ kinds: ["grunt", "shotgun"], count: 4, at: 6 }, { kinds: ["sniper"], count: 1, at: 7 }, { kinds: ["smg"], count: 2, at: 8 }] },
      { type: "reach", text: "Chegue à extração", at: "extract" },
    ],
  },
  {
    id: 3, name: "Infiltração", sub: "Vila — Missão furtiva", brief: "Infiltre-se na vila sem ser detectado. Pegue o documento do oficial.", map: "village", diff: "Normal", par: 420, credits: 650, xp: 340, stealth: true,
    intro: [{ who: INT, text: "Os inimigos têm visão reduzida e audição aguçada. Evite tiros altos." }, { who: INT, text: "Um silenciador ajuda. Recupere o documento na casa do comandante." }],
    outro: [{ who: INT, text: "Documentos obtidos. Vargas está movendo as tropas para o porto." }],
    objectives: [
      { type: "reach", text: "Aproxime-se da vila em silêncio", at: 3, spawns: [{ kinds: ["grunt"], count: 4, at: 4 }, { kinds: ["grunt"], count: 3, at: 6 }] },
      { type: "collect", text: "Encontre e pegue o documento", at: 7, spawns: [{ kinds: ["smg", "grunt"], count: 3, at: 7, radius: 8 }], dlg: [{ who: INT, text: "O documento está perto. Cuidado com as sentinelas." }] },
      { type: "reach", text: "Escape até a extração", at: "extract", ambush: [{ kinds: ["grunt", "smg"], count: 4, at: "near", radius: 20, alert: true }] },
    ],
  },
  {
    id: 4, name: "Contra-Ataque", sub: "Porto", brief: "Vargas lançou um ataque ao porto. Rechace as ondas inimigas e destrua o veículo blindado.", map: "port", diff: "Normal", par: 420, credits: 750, xp: 420,
    intro: [{ who: CMD, text: "O inimigo avança pelo cais com apoio blindado. Aguente a linha." }],
    outro: [{ who: CMD, text: "Blindado destruído. Eles recuaram para a Base Inimiga." }],
    objectives: [
      { type: "kill", text: "Rechace o primeiro ataque", n: 8, spawns: [{ kinds: ["grunt", "smg"], count: 5, at: 3 }, { kinds: ["shotgun"], count: 3, at: 4 }], fx: [{ t: 1, explode: 6, shake: 0.8 }, { t: 4, explode: 8, shake: 0.6 }] },
      { type: "destroy", text: "Destrua o veículo blindado", at: 6, spawns: [{ kinds: ["heavy"], count: 1, at: 6, radius: 5 }, { kinds: ["grunt"], count: 4, at: 6, radius: 8 }], dlg: [{ who: SGT, text: "Alvo blindado à vista! Use granadas ou o lança-granadas!" }] },
      { type: "reach", text: "Chegue à extração", at: "extract" },
    ],
  },
  {
    id: 5, name: "Base Inimiga", sub: "Fábrica — Invasão", brief: "Invada a instalação inimiga e destrua os geradores para cortar a energia.", map: "factory", diff: "Difícil", par: 480, credits: 900, xp: 520,
    intro: [{ who: CMD, text: "Essa fábrica é uma base de Vargas. Destruam os geradores e abram caminho." }],
    outro: [{ who: INT, text: "Energia cortada. Encontrei o local dos prisioneiros: eles estão na floresta." }],
    objectives: [
      { type: "kill", text: "Elimine os guardas da entrada", n: 6, spawns: [{ kinds: ["grunt", "smg"], count: 6, at: 2 }] },
      { type: "destroy", text: "Destrua o gerador principal", at: 5, spawns: [{ kinds: ["smg", "shotgun"], count: 4, at: 5, radius: 8 }, { kinds: ["heavy"], count: 1, at: 6 }] },
      { type: "kill", text: "Elimine os reforços", n: 6, spawns: [{ kinds: ["grunt", "smg", "shotgun"], count: 6, at: "near", radius: 20, alert: true }] },
      { type: "reach", text: "Escape pela saída leste", at: "extract" },
    ],
  },
  {
    id: 6, name: "Sobrevivência", sub: "Deserto — Ondas inimigas", brief: "Você está cercado. Resista ao ataque até a evacuação chegar.", map: "desert", diff: "Difícil", par: 150, credits: 1000, xp: 600,
    intro: [{ who: CMD, text: "O helicóptero de evacuação chega em 90 segundos. Segure a posição!" }],
    outro: [{ who: CMD, text: "Evacuação confirmada. Bom trabalho, soldado." }],
    objectives: [
      { type: "survive", text: "Sobreviva por 90 segundos", seconds: 90, spawns: [{ kinds: ["grunt", "smg"], count: 4, at: "near", radius: 25, alert: true }], waves: { every: 12, group: { kinds: ["grunt", "smg", "shotgun", "heavy"], count: 3, at: "near", radius: 28, alert: true } }, fx: [{ t: 20, explode: "near", shake: 0.7 }, { t: 55, explode: "near", shake: 0.7 }] },
      { type: "reach", text: "Corra até o ponto de extração", at: "extract" },
    ],
  },
  {
    id: 7, name: "Resgate", sub: "Floresta", brief: "Soldados aliados foram capturados. Encontre-os e liberte-os.", map: "forest", diff: "Difícil", par: 480, credits: 1100, xp: 680,
    intro: [{ who: INT, text: "Três prisioneiros foram levados a acampamentos na mata. Cada um tem guardas." }],
    outro: [{ who: SGT, text: "Todos a salvo. Vargas está preparando algo noturno." }],
    objectives: [
      { type: "rescue", text: "Resgate os prisioneiros (0/3)", n: 3, at: 3, spawns: [{ kinds: ["grunt", "smg"], count: 4, at: 3 }, { kinds: ["grunt", "shotgun"], count: 4, at: 5 }, { kinds: ["sniper", "grunt"], count: 3, at: 7 }], dlg: [{ who: INT, text: "Procure as marcas azuis no radar. Fique perto e toque em Interagir." }] },
      { type: "reach", text: "Escolte todos até a extração", at: "extract", ambush: [{ kinds: ["grunt", "smg", "shotgun"], count: 5, at: "near", radius: 22, alert: true }] },
    ],
  },
  {
    id: 8, name: "Operação Noturna", sub: "Base Noturna", brief: "Sob a escuridão, invada a base e elimine os oficiais.", map: "night", diff: "Difícil", par: 540, credits: 1300, xp: 780,
    intro: [{ who: CMD, text: "Sem apoio aéreo. A visibilidade é mínima, mas o inimigo também está cego fora dos holofotes." }],
    outro: [{ who: INT, text: "Interceptei: Vargas está no Complexo Industrial. É a nossa chance." }],
    objectives: [
      { type: "kill", text: "Elimine os sentinelas", n: 8, spawns: [{ kinds: ["grunt", "smg", "sniper"], count: 8, at: 3 }] },
      { type: "collect", text: "Recupere os dados do servidor", at: 6, spawns: [{ kinds: ["smg", "shotgun", "heavy"], count: 5, at: 6, radius: 8 }] },
      { type: "reach", text: "Fuja para a extração", at: "extract", ambush: [{ kinds: ["grunt", "smg", "shotgun"], count: 6, at: "near", radius: 20, alert: true }], fx: [{ t: 3, explode: "near", shake: 0.8 }] },
    ],
  },
  {
    id: 9, name: "Ataque Final", sub: "Complexo Industrial", brief: "A grande batalha. Rompa as defesas do complexo de Vargas.", map: "industrial", diff: "Extremo", par: 600, credits: 1600, xp: 900,
    intro: [{ who: CMD, text: "Tudo ou nada. Rompam as linhas e cheguem ao laboratório de Vargas." }],
    outro: [{ who: CMD, text: "Linha rompida! O laboratório é o último reduto. Vá!" }],
    objectives: [
      { type: "kill", text: "Rompa a primeira linha de defesa", n: 10, spawns: [{ kinds: ["grunt", "smg", "shotgun"], count: 7, at: 3 }, { kinds: ["heavy"], count: 1, at: 4 }, { kinds: ["sniper"], count: 2, at: 5 }], fx: [{ t: 2, explode: 5, shake: 0.9 }] },
      { type: "destroy", text: "Destrua o tanque de combustível", at: 7, spawns: [{ kinds: ["grunt", "smg", "heavy"], count: 6, at: 7, radius: 10 }] },
      { type: "survive", text: "Segure contra o contra-ataque (45s)", seconds: 45, waves: { every: 9, group: { kinds: ["grunt", "smg", "shotgun", "heavy"], count: 4, at: "near", radius: 26, alert: true } }, spawns: [{ kinds: ["grunt", "smg"], count: 4, at: "near", radius: 24, alert: true }] },
      { type: "reach", text: "Chegue à extração", at: "extract" },
    ],
  },
  {
    id: 10, name: "Operação Final", sub: "Laboratório — Confronto com Vargas", brief: "Invada o laboratório do Projeto Vértice e derrote o Comandante Vargas.", map: "lab", diff: "Extremo", par: 600, credits: 2500, xp: 1500,
    intro: [{ who: VIL, text: "Vocês chegaram longe... mas o Vértice já está ativo." }, { who: CMD, text: "Destrua o núcleo e capture Vargas. Câmbio e desligo." }],
    outro: [{ who: INT, text: "Vértice desativado. Vargas está fora de combate. Operação Aurora Negra concluída." }, { who: CMD, text: "Vocês salvaram milhares. Bom trabalho, soldado." }],
    objectives: [
      { type: "kill", text: "Elimine a guarda de elite", n: 9, spawns: [{ kinds: ["smg", "shotgun", "grunt"], count: 6, at: 3 }, { kinds: ["heavy"], count: 2, at: 4 }, { kinds: ["sniper"], count: 1, at: 5 }] },
      { type: "destroy", text: "Destrua o núcleo do Vértice", at: 6, spawns: [{ kinds: ["grunt", "smg", "shotgun"], count: 5, at: 6, radius: 8 }], fx: [{ t: 3, explode: "near", shake: 1 }] },
      { type: "boss", text: "Derrote o Comandante Vargas", n: 1, spawns: [{ kinds: ["commander"], count: 1, at: "extract", radius: 3 }, { kinds: ["heavy", "smg"], count: 3, at: "extract", radius: 6 }], dlg: [{ who: VIL, text: "Você não vai sair daqui vivo!" }], waves: { every: 18, group: { kinds: ["grunt", "smg"], count: 2, at: "near", radius: 20, alert: true } } },
    ],
  },
];

export interface Challenge { id: string; name: string; desc: string; map: string; goal: "headshots" | "kills" | "waves" | "score"; n: number; time: number; reward: number; xp: number; weapon?: string; kinds: EnemyKind[]; bots: number }
export const CHALLENGES: Challenge[] = [
  { id: "ch_headhunter", name: "Caçador de Cabeças", desc: "Acerte 8 tiros na cabeça em 120s.", map: "range", goal: "headshots", n: 8, time: 120, reward: 500, xp: 200, kinds: ["dummy"], bots: 6 },
  { id: "ch_blitz", name: "Blitz", desc: "Elimine 15 inimigos em 90s.", map: "city", goal: "kills", n: 15, time: 90, reward: 700, xp: 260, kinds: ["grunt", "smg"], bots: 8 },
  { id: "ch_pistol", name: "Só Pistola", desc: "Elimine 10 inimigos usando apenas pistola em 150s.", map: "village", goal: "kills", n: 10, time: 150, reward: 800, xp: 300, weapon: "pistol", kinds: ["grunt", "smg"], bots: 6 },
  { id: "ch_wave", name: "Resistência", desc: "Sobreviva até a onda 4 em 240s.", map: "desert", goal: "waves", n: 4, time: 240, reward: 900, xp: 340, kinds: ["grunt", "smg", "shotgun"], bots: 6 },
];
