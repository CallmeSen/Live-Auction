import { createDefaultAuctionSessionList } from '../defaults/auctionSessionDefaults';
import type {
  AuctionSessionDetailResponse,
  AuctionSessionListRequest,
  AuctionSessionListResponse,
  CreateAuctionSessionRequest,
  CreateAuctionSessionResponse,
  ReviewAuctionSessionRequest,
  ReviewAuctionSessionResponse,
  StartAuctionSessionResponse,
} from '../interfaces/auctionSession';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

export const auctionSessionService = {
  async getSessions(
    params: AuctionSessionListRequest = {},
  ): Promise<AuctionSessionListResponse> {
    try {
      const response = await axiosClient.get<
        ApiResponse<AuctionSessionListResponse>
      >('/auction-sessions', { params });

      return response.data.data;
    } catch {
      return createDefaultAuctionSessionList(params);
    }
  },

  async getMySessions(
    params: AuctionSessionListRequest = {},
  ): Promise<AuctionSessionListResponse> {
    try {
      const response = await axiosClient.get<
        ApiResponse<AuctionSessionListResponse>
      >('/auction-sessions/mine', { params });

      return response.data.data;
    } catch {
      return createDefaultAuctionSessionList(params);
    }
  },

  async getSessionById(
    sessionId: string,
  ): Promise<AuctionSessionDetailResponse> {
    const response = await axiosClient.get<
      ApiResponse<AuctionSessionDetailResponse>
    >(`/auction-sessions/${sessionId}`);

    return response.data.data;
  },

  async createSession(
    payload: CreateAuctionSessionRequest,
  ): Promise<CreateAuctionSessionResponse> {
    const response = await axiosClient.post<
      ApiResponse<CreateAuctionSessionResponse>
    >('/auction-sessions', payload);

    return response.data.data;
  },

  async startSession(
    sessionId: string,
  ): Promise<StartAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<StartAuctionSessionResponse>
    >(`/auction-sessions/${sessionId}/start`);

    return response.data.data;
  },

  // TODO(BACKEND): PATCH /admin/auction-sessions/{sessionId}/approve chua duoc trien khai.
  async approveSession(
    sessionId: string,
  ): Promise<ReviewAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<ReviewAuctionSessionResponse>
    >(`/admin/auction-sessions/${sessionId}/approve`);

    return response.data.data;
  },

  // TODO(BACKEND): PATCH /admin/auction-sessions/{sessionId}/reject chua duoc trien khai.
  async rejectSession(
    sessionId: string,
    payload: ReviewAuctionSessionRequest,
  ): Promise<ReviewAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<ReviewAuctionSessionResponse>
    >(`/admin/auction-sessions/${sessionId}/reject`, payload);

    return response.data.data;
  },
};
