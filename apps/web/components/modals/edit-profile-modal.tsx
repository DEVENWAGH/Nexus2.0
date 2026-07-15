"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import FileUpload from "../file-upload";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "../ui/spinner";
import { useModal } from "@/hooks/use-mode-store";

const formSchema = z.object({
    name: z.string().min(1, { message: "Username/Name is required" }).max(40, { message: "Name is too long" }),
    imageUrl: z.string().min(1, { message: "Profile picture is required" }),
});

const EditProfileModal = () => {
    const router = useRouter();
    const { isOpen, onClose, type } = useModal();
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

    const isModalOpen = isOpen && type === "editProfile";

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            imageUrl: "",
        },
    });

    useEffect(() => {
        if (!isModalOpen) return;

        const loadProfile = async () => {
            setIsLoadingProfile(true);
            try {
                const res = await axios.get("/api/profile");
                form.setValue("name", res.data.name || "");
                form.setValue("imageUrl", res.data.imageUrl || "");
            } catch (err) {
                console.error("Failed to load user profile in modal:", err);
            } finally {
                setIsLoadingProfile(false);
            }
        };

        loadProfile();
    }, [isModalOpen, form]);

    const loading = form.formState.isSubmitting || isLoadingProfile;

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        const loadingId = toast.loading("Updating profile...");
        try {
            await axios.post("/api/profile/setup", values);
            form.reset();
            router.refresh();
            onClose();
            toast.success("Profile updated successfully!", {
                id: loadingId,
            });
            window.location.reload();
        } catch (error) {
            console.log("unable to update profile", error);
            toast.error("Something went wrong. Please try again.", {
                id: loadingId,
            });
        }
    };

    const handleClose = () => {
        onClose();
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-background text-foreground p-0 overflow-hidden">
                <DialogHeader className="pt-8 px-6 pb-2">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Customize your profile
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        Change your display name/username and set a custom profile image.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6"
                    >
                        <div className="space-y-6 px-6">
                            <div className="flex items-center justify-center text-center">
                                <FormField
                                    control={form.control}
                                    name="imageUrl"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <FileUpload
                                                    endpoint="imageUploader"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="uppercase text-xs font-bold text-muted-foreground">
                                                Username / Name
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    disabled={loading}
                                                    className="bg-secondary/50 border-0 focus-visible:ring-0 text-foreground focus-visible:ring-offset-0"
                                                    placeholder="Enter your name"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                            />
                        </div>

                        <DialogFooter className="bg-muted/50 px-6 py-4">
                            <Button disabled={loading} variant="primary">
                                {loading ? <Spinner /> : "Save"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};

export default EditProfileModal;
