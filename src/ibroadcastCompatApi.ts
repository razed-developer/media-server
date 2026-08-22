import { invoke } from '@tauri-apps/api/core';
import { getActiveUserId, isTauriDesktop, pollIbroadcastDeviceAuth } from './api';
import type { IbDevicePoll } from './types';

export async function pollIbroadcastDeviceAuthCompat(deviceCode:string):Promise<IbDevicePoll>{
  if(isTauriDesktop()){
    return invoke<IbDevicePoll>('ibroadcast_device_poll_compat',{userId:getActiveUserId(),deviceCode});
  }
  // Browser API remains server-mediated. This wrapper keeps compatibility logic
  // isolated so it can be removed when iBroadcast's production OAuth behavior
  // consistently matches the documented device flow.
  return pollIbroadcastDeviceAuth(deviceCode);
}
