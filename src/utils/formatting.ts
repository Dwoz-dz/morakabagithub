/**
 * Formatting Utils
 * Date, time, number formatting
 */

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

export const formatTime = (date: Date): string => {
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatDateTime = (date: Date): string => {
  return `${formatDate(date)} - ${formatTime(date)}`;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat("ar-SA").format(num);
};

export const truncate = (str: string, length: number): string => {
  return str.length > length ? str.slice(0, length) + "..." : str;
};
