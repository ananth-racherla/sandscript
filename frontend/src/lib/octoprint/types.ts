export interface OctoStatusView {
  connected: boolean;
  reconnecting: boolean;
  state: string;
  isDisconnected: boolean;
  isPrinting: boolean;
  isIdle: boolean;
  tempsText: string;
  jobFileName: string;
  completion: number | null;
  timeLeftText: string;
}
