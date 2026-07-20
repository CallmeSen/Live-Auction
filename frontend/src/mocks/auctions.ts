import type { Auction, BidHistory } from '../features/auction/types';
import type { MyBid } from '../features/bid/types';

const imageParams = 'auto=format&fit=crop&q=85&w=1200';
const watchImage = `https://images.unsplash.com/photo-1639160740064-44d85d5be1ad?${imageParams}`;
const cameraImage = `https://images.unsplash.com/photo-1745945192362-be745823ffc2?${imageParams}`;
const vinylImage = `https://images.unsplash.com/photo-1471029093449-ca61fffdc2af?${imageParams}`;
const penImage = `https://images.unsplash.com/photo-1473186505569-9c61870c11f9?${imageParams}`;

export const mockAuctions: Auction[] = [
  {
    id: 1,
    title: 'Đồng hồ bỏ túi Thụy Sĩ 1920',
    category: 'Đồng hồ', categoryId: 'cat-watch', image: watchImage,
    images: [watchImage, cameraImage, penImage],
    currentPrice: 18_500_000, startingPrice: 10_000_000, minimumBidIncrement: 500_000, bidCount: 24,
    startTime: '2026-07-09T09:00:00+07:00', endTime: '2026-07-12T22:00:00+07:00', createdAt: '2026-07-07T08:30:00+07:00', status: 'ACTIVE', approvalStatus: 'APPROVED',
    seller: 'Trần Gia User', sellerEmail: 'sell1@gmail.com', location: 'TP. Hồ Chí Minh', condition: 'Tốt — đã kiểm định',
    description: 'Đồng hồ cơ bỏ túi sản xuất tại Thụy Sĩ đầu thế kỷ XX. Bộ máy lên cót tay còn hoạt động ổn định, mặt số men nguyên bản và vỏ đồng mang lớp patina tự nhiên.', featured: true,
  },
  {
    id: 2,
    title: 'Máy ảnh Rolleiflex Twin Lens',
    category: 'Máy ảnh', categoryId: 'cat-camera', image: cameraImage,
    currentPrice: 32_000_000, startingPrice: 22_000_000, minimumBidIncrement: 1_000_000, bidCount: 16,
    startTime: '2026-07-10T08:00:00+07:00', endTime: '2026-07-13T20:30:00+07:00', createdAt: '2026-07-08T09:10:00+07:00', status: 'ACTIVE', approvalStatus: 'APPROVED',
    seller: 'Analog House', sellerEmail: 'other-seller@gmail.com', location: 'Hà Nội', condition: 'Rất tốt',
    description: 'Rolleiflex hai ống kính với thiết kế cổ điển, ngoại hình được bảo quản tốt. Kính ngắm sáng, cơ cấu màn trập hoạt động và đi kèm bao da nguyên bản.',
  },
  {
    id: 3,
    title: 'Mâm đĩa than Audio Classic',
    category: 'Âm thanh', categoryId: 'cat-audio', image: vinylImage,
    currentPrice: 12_800_000, startingPrice: 8_000_000, minimumBidIncrement: 400_000, bidCount: 9,
    startTime: '2026-07-11T09:00:00+07:00', endTime: '2026-07-14T19:00:00+07:00', createdAt: '2026-07-09T10:00:00+07:00', status: 'UPCOMING', approvalStatus: 'PENDING',
    seller: 'Trần Gia User', sellerEmail: 'sell1@gmail.com', location: 'Đà Nẵng', condition: 'Tốt',
    description: 'Mâm đĩa than phong cách tối giản, được cân chỉnh và bảo dưỡng gần đây. Phù hợp cho người mới bắt đầu sưu tầm vinyl lẫn người chơi lâu năm.',
  },
  {
    id: 4,
    title: 'Bút máy bạc & sổ da thủ công',
    category: 'Sưu tầm', categoryId: 'cat-collectible', image: penImage,
    currentPrice: 6_200_000, startingPrice: 4_000_000, minimumBidIncrement: 200_000, bidCount: 11,
    startTime: '2026-07-16T09:00:00+07:00', endTime: '2026-07-18T21:00:00+07:00', createdAt: '2026-07-09T14:00:00+07:00', status: 'UPCOMING', approvalStatus: 'APPROVED',
    seller: 'Ink & Paper', sellerEmail: 'other-seller@gmail.com', location: 'TP. Hồ Chí Minh', condition: 'Mới 95%',
    description: 'Bộ sưu tập gồm bút máy thân bạc, ngòi vàng 14K và sổ bìa da làm thủ công. Một lựa chọn trang nhã dành cho người yêu nghệ thuật viết tay.',
  },
  {
    id: 5,
    title: 'Leica M3 phiên bản cổ điển',
    category: 'Máy ảnh', categoryId: 'cat-camera', image: cameraImage,
    currentPrice: 42_000_000, startingPrice: 28_000_000, minimumBidIncrement: 1_000_000, bidCount: 31,
    startTime: '2026-07-01T09:00:00+07:00', endTime: '2026-07-08T21:00:00+07:00', createdAt: '2026-06-28T08:00:00+07:00', status: 'ENDED', approvalStatus: 'APPROVED', finalPrice: 42_000_000, winner: 'Nguyễn Minh User',
    seller: 'Trần Gia User', sellerEmail: 'sell1@gmail.com', location: 'TP. Hồ Chí Minh', condition: 'Đã qua sử dụng',
    description: 'Máy ảnh rangefinder cổ điển được bảo quản trong tủ chống ẩm, đầy đủ giấy xác nhận và dây đeo da.',
  },
  {
    id: 6,
    title: 'Bộ sưu tập vinyl Jazz thập niên 70',
    category: 'Âm thanh', categoryId: 'cat-audio', image: vinylImage,
    currentPrice: 7_500_000, startingPrice: 7_500_000, minimumBidIncrement: 300_000, bidCount: 0,
    startTime: '2026-07-15T09:00:00+07:00', endTime: '2026-07-20T20:00:00+07:00', createdAt: '2026-07-09T15:30:00+07:00', status: 'CANCELLED', approvalStatus: 'REJECTED',
    seller: 'Trần Gia User', sellerEmail: 'sell1@gmail.com', location: 'TP. Hồ Chí Minh', condition: 'Tốt',
    description: 'Bộ 12 đĩa Jazz tuyển chọn. Phiên mẫu đã được hủy để minh họa trạng thái kiểm duyệt.',
  },
];

export const mockBidHistory: BidHistory[] = [
  { id: 1, auctionId: 1, bidder: 'N***h', amount: 18_500_000, time: '2026-07-10T07:42:00+07:00' },
  { id: 2, auctionId: 1, bidder: 'Bạn', amount: 18_000_000, time: '2026-07-10T07:35:00+07:00', isMine: true },
  { id: 3, auctionId: 1, bidder: 'T***n', amount: 17_500_000, time: '2026-07-10T07:21:00+07:00' },
  { id: 4, auctionId: 1, bidder: 'M***g', amount: 17_000_000, time: '2026-07-10T07:03:00+07:00' },
];

export const mockMyBids: MyBid[] = [
  { id: 1, auctionId: 1, auctionTitle: mockAuctions[0].title, image: mockAuctions[0].image, myBid: 18_000_000, currentPrice: 18_500_000, bidTime: '2026-07-10T07:35:00+07:00', status: 'OUTBID', auctionStatus: 'ACTIVE', auctionEndTime: mockAuctions[0].endTime },
  { id: 2, auctionId: 2, auctionTitle: mockAuctions[1].title, image: mockAuctions[1].image, myBid: 32_000_000, currentPrice: 32_000_000, bidTime: '2026-07-09T22:14:00+07:00', status: 'WINNING', auctionStatus: 'ACTIVE', auctionEndTime: mockAuctions[1].endTime },
  { id: 3, auctionId: 5, auctionTitle: mockAuctions[4].title, image: mockAuctions[4].image, myBid: 42_000_000, currentPrice: 42_000_000, bidTime: '2026-07-08T20:59:00+07:00', status: 'WON', auctionStatus: 'ENDED', auctionEndTime: mockAuctions[4].endTime },
];


