package com.example.backend.wallet;

import com.example.backend.WalletTransaction.WalletTransaction;
import com.example.backend.WalletTransaction.WalletTransactionRepository;
import com.example.backend.common.enums.WalletStatus;
import com.example.backend.common.enums.WalletTransactionStatus;
import com.example.backend.common.enums.WalletTransactionType;
import com.example.backend.common.exception.ErrorType;
import com.example.backend.wallet.dto.request.DepositRequest;
import com.example.backend.wallet.dto.response.WalletTransactionResponse;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.stereotype.Service;
import com.example.backend.user.User;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class WalletService {
    WalletRepository walletRepository;
    WalletTransactionRepository walletTransactionRepository;

    public Wallet createDefaultWallet(User user) {
        Wallet wallet = new Wallet();
        wallet.setUser(user);
        wallet.setBalance(BigDecimal.ZERO);
        wallet.setLockedBalance(BigDecimal.ZERO);
        wallet.setCurrency("VND");
        wallet.setStatus(WalletStatus.ACTIVE);

        return walletRepository.save(wallet);
    }

    public WalletTransactionResponse deposit(UUID userId, DepositRequest request) {
        Wallet wallet =  walletRepository.findByUserId(userId)
                .orElseThrow(()-> new RuntimeException(ErrorType.USER_NOT_FOUND.getMessage()));
        if(wallet.getStatus() != WalletStatus.ACTIVE ) {
            throw new RuntimeException(ErrorType.WALLET_INACTIVE.getMessage());
        }

        wallet.setBalance(wallet.getBalance().add(request.getAmount()));

        WalletTransaction transaction = new WalletTransaction();
        transaction.setWallet(wallet);
        transaction.setAmount(request.getAmount());
        transaction.setType(WalletTransactionType.DEPOSIT);
        transaction.setAmount(request.getAmount());
        transaction.setStatus(WalletTransactionStatus.SUCCESS);
        transaction.setCreatedAt(LocalDateTime.now());

        walletRepository.save(wallet);

        WalletTransaction savedTransaction = walletTransactionRepository.save(transaction);

        return new WalletTransactionResponse(
                savedTransaction.getId(),
                savedTransaction.getType(),
                savedTransaction.getAmount(),
                savedTransaction.getStatus(),
                savedTransaction.getCreatedAt()
        );
    }
}
