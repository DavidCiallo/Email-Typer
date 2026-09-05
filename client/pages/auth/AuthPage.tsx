"use client";

import React, { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { BrandIcon } from "../../components/logo";
import { ThemeToggle } from "../../components/theme-toggle";
import { AuthRouter } from "../../api/instance";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "../../methods/notify";

export default function Component() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [isRegister, setIsRegister] = useState(false);
    const [allowRegister, setAllowRegister] = useState(false);

    useEffect(() => {
        AuthRouter.config({}, (res: any) => {
            if (res.success && res.data) {
                setAllowRegister(res.data.allow_register === true);
            }
        });
    }, []);

    // Handle verification token from email link
    useEffect(() => {
        if (!token) return;
        AuthRouter.verify({ token }, (res: any) => {
            if (res.success) {
                toast({ title: "邮箱验证成功，请登录", color: "success" });
                navigate("/auth");
            } else {
                toast({ title: res.message || "验证失败", color: "danger" });
            }
        });
    }, [token]);

    const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const { email, password } = Object.fromEntries(new FormData(event.currentTarget));
        AuthRouter.login({ identify: { email: email.toString(), password: password.toString() } });
        window.addEventListener("login", async (e: any) => {
            const loginResult = e.detail;
            if (loginResult.success && loginResult.data?.token) {
                toast({ title: "登录成功", color: "success" });
                localStorage.setItem("token", loginResult.data.token);
                localStorage.setItem("login_email", email.toString());
                await new Promise(r => setTimeout(r, 500));
                navigate("/inbox");
            } else {
                toast({ title: loginResult.message || "登录失败，请检查密码", color: "danger" });
            }
        }, { once: true });
    };

    const handleRegister = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const { name, email, password } = Object.fromEntries(new FormData(event.currentTarget));
        AuthRouter.register({ identify: { name: name.toString(), email: email.toString(), password: password.toString() } });
        window.addEventListener("register", async (e: any) => {
            const res = e.detail;
            if (res.success && res.data?.needs_verification) {
                toast({ title: "注册成功，请查看邮箱完成验证", color: "success" });
                setIsRegister(false);
            } else {
                toast({ title: res.message || "注册失败，邮箱可能已存在", color: "danger" });
            }
        }, { once: true });
    };

    return (
        <div className="bg-background relative flex min-h-screen items-center justify-center px-4">
            <div className="absolute top-4 right-4 flex items-center gap-2">
                <ThemeToggle />
            </div>
            <div className="flex w-full max-w-sm flex-col gap-6">
                <div className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
                    <BrandIcon className="size-9" />
                    多邮箱系统
                </div>

                {!isRegister ? (
                    <>
                        {/* 登录表单 */}
                        <form className="flex flex-col gap-4" onSubmit={handleLogin}>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="email">邮箱</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    required
                                    type="email"
                                    placeholder="请输入邮箱"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="password">密码</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    required
                                    type="password"
                                    placeholder="请输入密码"
                                />
                            </div>
                            <div
                                className="text-muted-foreground flex w-full cursor-pointer justify-end text-sm hover:text-foreground"
                                onClick={() =>
                                    toast({ title: "请联系管理员🙁", color: "danger" })
                                }
                            >
                                忘记密码？
                            </div>
                            <Button type="submit" className="w-full">
                                登录
                            </Button>
                        </form>
                        {allowRegister && (
                            <p className="text-muted-foreground text-center text-sm">
                                还没有账号？{" "}
                                <span
                                    className="text-primary cursor-pointer text-sm hover:underline"
                                    onClick={() => setIsRegister(true)}
                                >
                                    立即注册
                                </span>
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        {/* 注册表单 */}
                        <form className="flex flex-col gap-4" onSubmit={handleRegister}>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="请输入姓名"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="reg-email">邮箱</Label>
                                <Input
                                    id="reg-email"
                                    name="email"
                                    required
                                    type="email"
                                    placeholder="请输入邮箱"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="reg-password">密码</Label>
                                <Input
                                    id="reg-password"
                                    name="password"
                                    required
                                    type="password"
                                    placeholder="请输入密码"
                                />
                            </div>
                            <Button type="submit" className="w-full">
                                注册
                            </Button>
                        </form>
                        <p className="text-muted-foreground text-center text-sm">
                            已有账号？{" "}
                            <span
                                className="text-primary cursor-pointer text-sm hover:underline"
                                onClick={() => setIsRegister(false)}
                            >
                                返回登录
                            </span>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
