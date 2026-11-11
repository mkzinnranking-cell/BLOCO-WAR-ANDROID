/**
 * Arquitetura preparada para multiplayer online (ainda NÃO implementado).
 *
 * O jogo hoje roda 100% local (bots). Para ligar um servidor no futuro, implemente
 * `NetAdapter` (WebSocket / WebRTC) e faça o `Game` consumir `snapshots` em vez de
 * simular bots locais: cada ator já possui `id`, `team`, posição e yaw — o mesmo
 * formato usado em `PlayerSnapshot`.
 */
export interface PlayerSnapshot { id: number; name: string; team: number; x: number; y: number; z: number; yaw: number; pitch: number; hp: number; weapon: string; alive: boolean }
export interface RoomInfo { id: string; name: string; mode: "dm" | "tdm" | "dom"; map: string; players: number; max: number }
export interface NetAdapter {
  readonly connected: boolean;
  connect(url: string, playerName: string): Promise<void>;
  listRooms(): Promise<RoomInfo[]>;
  createRoom(info: Omit<RoomInfo, "id" | "players">): Promise<RoomInfo>;
  joinRoom(id: string): Promise<void>;
  sendInput(input: unknown): void;
  onSnapshot(fn: (players: PlayerSnapshot[]) => void): void;
  disconnect(): void;
}
/** Sem servidor configurado, o adaptador oficial é este — claramente indisponível. */
export const OfflineNet: NetAdapter = {
  connected: false,
  async connect() { throw new Error("Servidor online indisponível nesta versão."); },
  async listRooms() { return []; },
  async createRoom() { throw new Error("Servidor online indisponível nesta versão."); },
  async joinRoom() { throw new Error("Servidor online indisponível nesta versão."); },
  sendInput() { /* noop */ },
  onSnapshot() { /* noop */ },
  disconnect() { /* noop */ },
};
