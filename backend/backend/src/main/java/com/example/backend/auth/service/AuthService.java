package com.example.backend.auth.service;

import com.example.backend.auth.dto.request.RegisterRequest;
import com.example.backend.auth.dto.response.UserResponse;
import com.example.backend.common.enums.Role;
import com.example.backend.common.enums.UserStatus;
import com.example.backend.common.exception.ErrorType;
import lombok.AccessLevel;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.auth.UserDetailsForToken;
import com.example.backend.auth.dto.request.LoginRequest;
import com.example.backend.auth.dto.response.LoginResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.example.backend.wallet.WalletService;

@Service
@RequiredArgsConstructor
@Slf4j
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AuthService {

    UserRepository userRepository;
    PasswordEncoder passwordEncoder;
    JwtService jwtService;
    WalletService walletService;

    public LoginResponse login(LoginRequest request){
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(()-> new RuntimeException((ErrorType.INVALID_PASSWORD_OR_EMAIL.getMessage())));

        boolean isPasswordCorrect = passwordEncoder.matches(request.getPassword(), user.getPassword());

        if(!isPasswordCorrect){
            throw new RuntimeException(ErrorType.INVALID_PASSWORD_OR_EMAIL.getMessage());
        }

        if(user.getStatus()!= UserStatus.ACTIVE){
            throw new RuntimeException(("Invalid username or password"));
        }

        UserDetailsForToken tokenUser = new UserDetailsForToken(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                user.getStatus()
        );

        UserResponse userResponse = new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                user.getStatus()
        );

        String accessToken = jwtService.generateToken(tokenUser);
        return new LoginResponse(
                accessToken,
                "Bearer",
                userResponse
        );
    }

    public UserResponse register(RegisterRequest request){
        boolean emailExists = userRepository.existsByEmail(request.getEmail());

        if(emailExists){
            throw new RuntimeException(ErrorType.EMAIL_ALREADY_EXISTS.getMessage());
        }

        User user = new User();

        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullname());

        user.setRole(Role.USER);

        user.setStatus(UserStatus.ACTIVE);

        User savedUser = userRepository.save(user);

        walletService.createDefaultWallet(savedUser);

        return new  UserResponse(
                savedUser.getId(),
                savedUser.getEmail(),
                savedUser.getFullName(),
                savedUser.getRole(),
                savedUser.getStatus()
        );

    }
}
