package com.example.backend.wallet;

import com.example.backend.wallet.dto.request.DepositRequest;
import com.example.backend.wallet.dto.response.WalletTransactionResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/wallets")
@RequiredArgsConstructor
public class WalletController {

    private final WalletService walletService;

    @PostMapping("/deposit")
    public ResponseEntity<WalletTransactionResponse> deposit(
            Authentication authentication,
            @Valid @RequestBody DepositRequest request
    ) {
        UUID userId = UUID.fromString(authentication.getName());

        WalletTransactionResponse response = walletService.deposit(userId, request);

        return ResponseEntity.ok(response);
    }
}