package com.example.backend.auth.dto.response;

import com.example.backend.common.enums.Role;
import com.example.backend.common.enums.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@AllArgsConstructor
@Getter
@Setter
public class UserResponse {
    private UUID id;
    private String email;
    private String fullname;
    private Role role;
    private UserStatus status;
}
