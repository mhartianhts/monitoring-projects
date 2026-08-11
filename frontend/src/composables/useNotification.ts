import { notify } from "../services/notification.service";

export function useNotification() {
  return notify;
}

export default useNotification;
