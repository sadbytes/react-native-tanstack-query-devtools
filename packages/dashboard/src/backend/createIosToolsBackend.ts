import { buildIosConnectionHints, getIosStatus, listIosDevices } from "./platforms/ios";

type CreateIosToolsBackendOptions = {
  enabled: boolean;
  host: string;
};

export function createIosToolsBackend(options: CreateIosToolsBackendOptions) {
  return {
    isEnabled() {
      return options.enabled;
    },
    async getStatus() {
      return getIosStatus(options.enabled);
    },
    async listDevices() {
      const status = await getIosStatus(options.enabled);
      return listIosDevices(status);
    },
    async listConnectionHints() {
      const status = await getIosStatus(options.enabled);
      const devices = await listIosDevices(status);
      return buildIosConnectionHints(devices, { host: options.host });
    },
    async refresh() {
      const status = await getIosStatus(options.enabled);
      const devices = await listIosDevices(status);
      return {
        devices,
        status,
        hints: buildIosConnectionHints(devices, { host: options.host }),
      };
    },
  };
}
