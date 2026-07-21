import axiosClient from './axiosClient';
import type { ApiResponse } from './types';
import type {
    AuctionItemDetailResponse,
    AuctionSessionDetailResponse,
    AuctionSessionListRequest,
    AuctionSessionListResponse,
    CreateAuctionItemRequest,
    CreateAuctionItemResponse,
    CreateAuctionSessionRequest,
    CreateAuctionSessionResponse,
    StartAuctionSessionResponse,
} from './auctionService.types';

export const auctionService = {
    async getSessions(
        params: AuctionSessionListRequest = {},
    ): Promise<AuctionSessionListResponse> {
        const response = await axiosClient.get<
            ApiResponse<AuctionSessionListResponse>
        >('/auction-sessions', { params });

        return response.data.data;
    },

    async getMySessions(
        params: AuctionSessionListRequest = {},
    ): Promise<AuctionSessionListResponse> {
        const response = await axiosClient.get<
            ApiResponse<AuctionSessionListResponse>
        >('/auction-sessions/mine', { params });

        return response.data.data;
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

    async getItemById(
        itemId: string,
    ): Promise<AuctionItemDetailResponse> {
        const response = await axiosClient.get<
            ApiResponse<AuctionItemDetailResponse>
        >(`/auction-items/${itemId}`);

        return response.data.data;
    },

    async createItem(
        sessionId: string,
        payload: CreateAuctionItemRequest,
    ): Promise<CreateAuctionItemResponse> {
        const response = await axiosClient.post<
            ApiResponse<CreateAuctionItemResponse>
        >(`/auction-sessions/${sessionId}/items`, payload);

        return response.data.data;
    },
};