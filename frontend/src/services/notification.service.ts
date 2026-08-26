import Swal, { type SweetAlertOptions, type SweetAlertIcon } from "sweetalert2";

// Custom styled SweetAlert modal instance
export const CustomSwal = Swal.mixin({
  customClass: {
    popup: "custom-swal-popup",
    confirmButton: "swal2-styled swal2-confirm",
    cancelButton: "swal2-styled swal2-cancel",
    denyButton: "swal2-styled swal2-deny",
    input: "swal2-input",
  },
  buttonsStyling: false,
  reverseButtons: true,
  focusConfirm: false,
});

// Custom styled SweetAlert Toast instance
export const ToastSwal = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: {
    popup: "custom-swal-toast",
  },
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export const notify = {
  /**
   * Tampilkan alert Sukses
   */
  success(title: string, text?: string, options?: SweetAlertOptions) {
    return CustomSwal.fire({
      icon: "success",
      title,
      text,
      confirmButtonText: "OK",
      ...options,
    });
  },

  /**
   * Tampilkan alert Error
   */
  error(title: string, text?: string, options?: SweetAlertOptions) {
    return CustomSwal.fire({
      icon: "error",
      title,
      text,
      confirmButtonText: "Tutup",
      ...options,
    });
  },

  /**
   * Tampilkan alert Warning
   */
  warning(title: string, text?: string, options?: SweetAlertOptions) {
    return CustomSwal.fire({
      icon: "warning",
      title,
      text,
      confirmButtonText: "Mengerti",
      ...options,
    });
  },

  /**
   * Tampilkan alert Informasi
   */
  info(title: string, text?: string, options?: SweetAlertOptions) {
    return CustomSwal.fire({
      icon: "info",
      title,
      text,
      confirmButtonText: "OK",
      ...options,
    });
  },

  /**
   * Dialog Konfirmasi (Returns Promise<boolean>)
   */
  async confirm(
    title: string,
    text?: string,
    confirmText = "Ya, Lanjutkan",
    cancelText = "Batal",
    options?: SweetAlertOptions
  ): Promise<boolean> {
    const result = await CustomSwal.fire({
      icon: "question",
      title,
      text,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      ...options,
    });
    return result.isConfirmed;
  },

  /**
   * Dialog Input Prompt (Returns Promise<string | null>)
   */
  async prompt(
    title: string,
    text?: string,
    defaultValue = "",
    placeholder = "Ketik di sini...",
    options?: SweetAlertOptions
  ): Promise<string | null> {
    const result = await CustomSwal.fire({
      icon: "question",
      title,
      text,
      input: "text",
      inputValue: defaultValue,
      inputPlaceholder: placeholder,
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      inputValidator: (value: any) => {
        if (!value || !String(value).trim()) {
          return "Input tidak boleh kosong!";
        }
        return null;
      },
      ...options,
    } as SweetAlertOptions);

    return result.isConfirmed && typeof result.value === "string" ? result.value : null;
  },

  /**
   * Toast notification singkat (pojok kanan atas)
   */
  toast(
    title: string,
    icon: SweetAlertIcon = "success",
    timer = 3500
  ) {
    return ToastSwal.fire({
      icon,
      title,
      timer,
    });
  },

  toastSuccess(title: string, timer = 3500) {
    return this.toast(title, "success", timer);
  },

  toastError(title: string, timer = 3500) {
    return this.toast(title, "error", timer);
  },

  /**
   * Indicator Loading / Processing
   */
  loading(title: string, text = "Mohon tunggu sebentar...") {
    return CustomSwal.fire({
      title,
      text,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  },

  /**
   * Tutup segenap dialog SweetAlert
   */
  close() {
    Swal.close();
  },
};

export default notify;
