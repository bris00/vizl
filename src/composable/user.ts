import { useState, useMemo, createContext, useContext, useEffect } from "react";

export const Undef = {
    map<T, R>(val: T | undefined, f: (_: T) => R): R | undefined {
        if (val !== undefined) {
            return f(val);
        } else {
            return undefined;
        }
    }
};

export const Null = {
    map<T, R>(val: T | null, f: (_: T) => R): R | null {
        if (val !== null) {
            return f(val);
        } else {
            return null;
        }
    }
};

export function createUser() {
    const [idToken, setIdToken] = useState<string|null>(Null.map(localStorage.getItem('idToken'), JSON.parse));

    const id = useMemo(() => {
        return Undef.map(idToken?.split('.')[1], token => JSON.parse(window.atob(token)))
    }, [idToken]);

    const [accessToken, setAccessToken] = useState<string|null>(Null.map(localStorage.getItem('accessToken'), JSON.parse));
    const [refreshToken, setRefreshToken] = useState<string|null>(Null.map(localStorage.getItem('refreshToken'), JSON.parse));

    useEffect(() => {
        localStorage.setItem('idToken', JSON.stringify(idToken));
    }, [idToken]);

    useEffect(() => {
        localStorage.setItem('accessToken', JSON.stringify(accessToken));
    }, [accessToken]);

    useEffect(() => {
        localStorage.setItem('refreshToken', JSON.stringify(refreshToken));
    }, [refreshToken]);
    
    return {
        id,
        idToken,
        accessToken,
        refreshToken,
        setAccessToken,
        setIdToken,
        setRefreshToken,
    };
};

export const UserContext = createContext<undefined | ReturnType<typeof createUser>>(undefined);

export function useUser() {
   const context = useContext(UserContext)

   if (context === undefined) {
     throw new Error("useUser must be within UserProvider")
   }
  
   return context
}
      