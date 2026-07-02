package com.example.backend.wallet;

import com.example.backend.common.enums.WalletStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import com.example.backend.user.User;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "wallet")
@Getter
@Setter
public class Wallet {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(nullable = false)
    private BigDecimal balance;
    private  BigDecimal lockedBalance;

    @Column(nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    private WalletStatus status;

    @OneToOne
    @JoinColumn(name = "user_id", nullable = false,unique=true)
    private User user;
}
