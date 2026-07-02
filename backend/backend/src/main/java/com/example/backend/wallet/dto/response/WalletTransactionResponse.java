package com.example.backend.wallet.dto.response;

import com.example.backend.common.enums.WalletTransactionStatus;
import com.example.backend.common.enums.WalletTransactionType;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.UUID;

@AllArgsConstructor
@Getter
@Setter
public class WalletTransactionResponse {
    UUID transactionId;
    WalletTransactionType type;
    BigDecimal amount;
    WalletTransactionStatus status;
    LocalDateTime createdAt;
}
