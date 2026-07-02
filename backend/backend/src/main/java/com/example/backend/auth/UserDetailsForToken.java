package com.example.backend.auth;

import com.example.backend.common.enums.Role;
import com.example.backend.common.enums.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

@Getter
@AllArgsConstructor
public class UserDetailsForToken {
    private UUID id;
    private String email;
    private String fullName;
    private Role role;
    private UserStatus status;
}
