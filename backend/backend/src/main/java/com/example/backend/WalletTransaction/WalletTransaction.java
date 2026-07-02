package com.example.backend.WalletTransaction;

import com.example.backend.common.enums.WalletTransactionStatus;
import com.example.backend.common.enums.WalletTransactionType;
import com.example.backend.wallet.Wallet;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name="wallet_transactions")
@Getter
@Setter
public class WalletTransaction {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name="wallet_id", nullable=false)
    private Wallet wallet;

    @Enumerated(EnumType.STRING)
    @Column(nullable=false)
    private WalletTransactionType type;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable=false)
    private WalletTransactionStatus status;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}
