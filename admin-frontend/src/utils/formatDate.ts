export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const getTimeLeft = (value: string) => {
  const distance = new Date(value).getTime() - Date.now();
  if (distance <= 0) return 'Đã kết thúc';
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  if (days > 0) return `${days} ngày ${hours} giờ`;
  return `${hours} giờ ${minutes} phút`;
};
