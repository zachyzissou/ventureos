export type BridgeTokenSource =
  | 'cli-token-file'
  | 'env-token'
  | 'env-token-file'
  | 'default-token-file';

export interface BridgeTokenOptions {
  cliTokenFile?: string;
  explicitToken?: string;
  envTokenFile?: string;
  defaultTokenFile?: string;
}

export type BridgeTokenResolved =
  | {
      ok: true;
      token: string;
      source: BridgeTokenSource;
    }
  | {
      ok: false;
      source: BridgeTokenSource;
      errorCode: 'INVALID_BRIDGE_TOKEN_FILE' | 'MISSING_BRIDGE_TOKEN';
      errorMessage: string;
    };

export function resolveBridgeToken(options?: BridgeTokenOptions): BridgeTokenResolved;
export function readBridgeTokenOrThrow(options?: BridgeTokenOptions): {
  ok: true;
  token: string;
  source: BridgeTokenSource;
};
