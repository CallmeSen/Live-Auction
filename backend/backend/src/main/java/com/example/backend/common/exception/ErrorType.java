package com.example.backend.common.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorType {

    // Common errors
    BAD_REQUEST("Yêu cầu không hợp lệ", 4000, HttpStatus.BAD_REQUEST),
    UNAUTHORIZED("Bạn chưa đăng nhập", 4001, HttpStatus.UNAUTHORIZED),
    FORBIDDEN("Bạn không có quyền thực hiện hành động này", 4002, HttpStatus.FORBIDDEN),
    NOT_FOUND("Không tìm thấy dữ liệu", 4003, HttpStatus.NOT_FOUND),
    INTERNAL_SERVER_ERROR("Lỗi hệ thống", 5000, HttpStatus.INTERNAL_SERVER_ERROR),

    // Auth errors
    EMAIL_ALREADY_EXISTS("Email already exists", 4100, HttpStatus.BAD_REQUEST),
    EMAIL_NOT_FOUND("Email not found", 4101, HttpStatus.NOT_FOUND),
    INVALID_PASSWORD("Invalid password", 4102, HttpStatus.BAD_REQUEST),
    USER_NOT_FOUND("User not found", 4103, HttpStatus.NOT_FOUND),
    USER_INACTIVE("User account is inactive", 4104, HttpStatus.FORBIDDEN),

    // Wallet errors
    WALLET_NOT_FOUND("Wallet not found", 4200, HttpStatus.NOT_FOUND),
    INSUFFICIENT_BALANCE("Insufficient balance", 4201, HttpStatus.BAD_REQUEST),
    WALLET_INACTIVE("Wallet is inactive", 4202, HttpStatus.FORBIDDEN),

    // Auction item errors
    AUCTION_ITEM_NOT_FOUND("Auction item not found", 4300, HttpStatus.NOT_FOUND),
    AUCTION_ITEM_NOT_ACTIVE("Auction item is not active", 4301, HttpStatus.BAD_REQUEST),
    AUCTION_ITEM_ALREADY_ENDED("Auction item already ended", 4302, HttpStatus.BAD_REQUEST),
    AUCTION_ITEM_NOT_STARTED("Auction item has not started yet", 4303, HttpStatus.BAD_REQUEST),
    AUCTION_ITEM_OWNER_CANNOT_BID("Owner cannot bid on own auction item", 4304, HttpStatus.BAD_REQUEST),

    // Bid errors
    BID_AMOUNT_TOO_LOW("Bid amount is too low", 4400, HttpStatus.BAD_REQUEST),
    BID_NOT_FOUND("Bid not found", 4401, HttpStatus.NOT_FOUND),
    BID_TIME_EXPIRED("Bidding time has expired", 4402, HttpStatus.BAD_REQUEST),
    BIDDER_NOT_ALLOWED("Bidder is not allowed", 4403, HttpStatus.FORBIDDEN),

    // Order / payment errors
    ORDER_NOT_FOUND("Order not found", 4500, HttpStatus.NOT_FOUND),
    PAYMENT_FAILED("Payment failed", 4501, HttpStatus.BAD_REQUEST),
    PAYMENT_NOT_FOUND("Payment not found", 4502, HttpStatus.NOT_FOUND),

    // File / image upload errors
    FILE_UPLOAD_FAILED("File upload failed", 4600, HttpStatus.BAD_REQUEST),
    INVALID_FILE_TYPE("Invalid file type", 4601, HttpStatus.BAD_REQUEST),
    FILE_SIZE_TOO_LARGE("File size is too large", 4602, HttpStatus.BAD_REQUEST);

    private final String message;
    private final int code;
    private final HttpStatus httpStatus;
}