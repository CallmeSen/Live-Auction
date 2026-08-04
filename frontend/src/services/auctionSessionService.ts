import { createDefaultAuctionSessionList } from '../defaults/auctionSessionDefaults';
import type {
  ApproveAuctionSessionResponse,
  AuctionSessionDetailResponse,
  AuctionSessionListRequest,
  AuctionSessionListResponse,
  CancelAuctionSessionRequest,
  CancelAuctionSessionResponse,
  CreateAuctionSessionRequest,
  CreateAuctionSessionResponse,
  RejectAuctionSessionRequest,
  RejectAuctionSessionResponse,
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


  async getAdminSessions(
    params: AuctionSessionListRequest = {},
  ): Promise<AuctionSessionListResponse> {
    const response = await axiosClient.get<
      ApiResponse<AuctionSessionListResponse>
    >('/admin/auction-sessions', { params });

    return response.data.data;
  },

  async getPendingSessions(
    params: AuctionSessionListRequest = {},
  ): Promise<AuctionSessionListResponse> {
    const response = await axiosClient.get<
      ApiResponse<AuctionSessionListResponse>
    >('/admin/auction-sessions/pending', {
      params: {
        page: params.page,
        size: params.size,
        keyword: params.keyword,
        categoryId: params.categoryId,
      },
    });

    return response.data.data;
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

  async approveSession(
    sessionId: string,
  ): Promise<ApproveAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<ApproveAuctionSessionResponse>
    >(`/admin/auction-sessions/${sessionId}/approve`);

    return response.data.data;
  },

  async rejectSession(
    sessionId: string,
    payload: RejectAuctionSessionRequest,
  ): Promise<RejectAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<RejectAuctionSessionResponse>
    >(`/admin/auction-sessions/${sessionId}/reject`, payload);

    return response.data.data;
  },

  async cancelSession(
    sessionId: string,
    payload: CancelAuctionSessionRequest,
  ): Promise<CancelAuctionSessionResponse> {
    const response = await axiosClient.patch<
      ApiResponse<CancelAuctionSessionResponse>
    >(`/admin/auction-sessions/${sessionId}/cancel`, payload);

    return response.data.data;
  },
};
