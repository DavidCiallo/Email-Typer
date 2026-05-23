"use client";

import React, { useState } from "react";
import { Button, Input, Link, Form } from "@heroui/react";
import { AuthRouter } from "../../api/instance";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "../../methods/notify";

export default function Component() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [isRegister, setIsRegister] = useState(false);

    // Handle verification token from email link
    if (token) {
        AuthRouter.verify({ token }, (res: any) => {
            if (res.success) {
                toast({ title: "邮箱验证成功，请登录", color: "success" });
                navigate("/auth");
            } else {
                toast({ title: res.message || "验证失败", color: "danger" });
            }
        });
    }

    const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const { email, password } = Object.fromEntries(new FormData(event.currentTarget));
        AuthRouter.login({ identify: { email: email.toString(), password: password.toString() } });
        window.addEventListener("login", async (e: any) => {
            const loginResult = e.detail;
            if (loginResult.success && loginResult.data?.token) {
                toast({ title: "登录成功", color: "success" });
                localStorage.setItem("token", loginResult.data.token);
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
        <div className="flex h-full w-full items-center justify-center">
            <div className="rounded-large flex w-full max-w-sm flex-col gap-4 px-8 pt-[20vh]">
                <p className="pb-4 text-left text-3xl font-semibold">
                    <span aria-label="emoji" className="mr-4" role="emoji">
                        📮
                    </span>
                    多邮箱系统
                </p>

                {!isRegister ? (
                    <>
                        {/* 登录表单 */}
                        <Form key="login" className="flex flex-col gap-4" validationBehavior="native" onSubmit={handleLogin}>
                            <Input
                                isRequired
                                label="邮箱"
                                labelPlacement="outside"
                                name="email"
                                placeholder="请输入邮箱"
                                type="email"
                                variant="bordered"
                            />
                            <Input
                                isRequired
                                label="密码"
                                labelPlacement="outside"
                                name="password"
                                placeholder="请输入密码"
                                type="password"
                                variant="bordered"
                            />
                            <div className="flex w-full items-center justify-end px-1 py-2">
                                <Link className="text-default-500 cursor-pointer" size="sm" onClick={
                                    () => toast({ title: "请联系管理员🙁", color: "danger" })
                                }>
                                    忘记密码？
                                </Link>
                            </div>
                            <Button className="w-full" color="primary" type="submit">
                                登录
                            </Button>
                        </Form>
                        <p className="text-center text-sm text-gray-500">
                            还没有账号？{" "}
                            <Link className="cursor-pointer text-sm" size="sm" onClick={() => setIsRegister(true)}>
                                立即注册
                            </Link>
                        </p>
                    </>
                ) : (
                    <>
                        {/* 注册表单 */}
                        <Form key="register" className="flex flex-col gap-4" validationBehavior="native" onSubmit={handleRegister}>
                            <Input
                                isRequired
                                label="姓名"
                                labelPlacement="outside"
                                name="name"
                                placeholder="请输入姓名"
                                variant="bordered"
                            />
                            <Input
                                isRequired
                                label="邮箱"
                                labelPlacement="outside"
                                name="email"
                                placeholder="请输入邮箱"
                                type="email"
                                variant="bordered"
                            />
                            <Input
                                isRequired
                                label="密码"
                                labelPlacement="outside"
                                name="password"
                                placeholder="请输入密码"
                                type="password"
                                variant="bordered"
                            />
                            <Button className="w-full" color="primary" type="submit">
                                注册
                            </Button>
                        </Form>
                        <p className="text-center text-sm text-gray-500">
                            已有账号？{" "}
                            <Link className="cursor-pointer text-sm" size="sm" onClick={() => setIsRegister(false)}>
                                返回登录
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
