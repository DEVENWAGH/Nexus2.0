"use client";

import { useState } from "react";

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
import { extractInviteCode } from "@/lib/invite-utils";

const createFormSchema = z.object({
    name: z.string().min(1, { message: "Server name is required" }),
    imageUrl: z.string().min(1, { message: "Upload server icons first" }),
});

const joinFormSchema = z.object({
    inviteCode: z.string().min(1, { message: "Invite code is required" }),
});

const CreateServerModal = () => {
    const router = useRouter();
    const { isOpen, onClose, type } = useModal();
    const [choice, setChoice] = useState<"create" | "join">("create");

    const isModalOpen = isOpen && type == "createServer";

    const createForm = useForm({
        resolver: zodResolver(createFormSchema),
        defaultValues: {
            name: "",
            imageUrl: "",
        },
    });

    const joinForm = useForm({
        resolver: zodResolver(joinFormSchema),
        defaultValues: {
            inviteCode: "",
        },
    });

    const form = choice === "create" ? createForm : joinForm;
    const loading = form.formState.isSubmitting;

    const onCreateSubmit = async (values: z.infer<typeof createFormSchema>) => {
        const loadingId = toast.loading("Creating server...");
        try {
            await axios.post("/api/servers", values);
            createForm.reset();
            router.refresh();
            onClose();
            toast.success("Server created successfully!", {
                id: loadingId,
            });
        } catch (error) {
            console.log("unable to create server", error);
            toast.error("Something went wrong. Please try again.", {
                id: loadingId,
            });
        }
    };

    const onJoinSubmit = async (values: z.infer<typeof joinFormSchema>) => {
        try {
            // Extract the invite code from URL or use directly
            const inviteCode = extractInviteCode(values.inviteCode);
            // Redirect to the invite page which handles joining the server
            router.push(`/invite/${inviteCode}`);
            onClose();
        } catch (error) {
            console.log("unable to join server", error);
            toast.error("Invalid invite code.");
        }
    };

    const handleClose = () => {
        createForm.reset();
        joinForm.reset();
        setChoice("create");
        onClose();
    };
    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-background text-foreground p-0 overflow-hidden">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Create your server or join another server
                    </DialogTitle>
                </DialogHeader>

                {/* choice create server or join invite code */}
                <div className="flex items-center justify-center gap-3 border p-3 rounded-md mx-6">
                    <Button
                        variant={choice === "create" ? "primary" : "outline"}
                        onClick={() => setChoice("create")}
                        className="flex-1"
                    >
                        Create server
                    </Button>
                    <Button
                        variant={choice === "join" ? "primary" : "outline"}
                        onClick={() => setChoice("join")}
                        className="flex-1"
                    >
                        Join server
                    </Button>
                </div>

                {choice === "create" ? (
                    <Form {...createForm}>
                        <form
                            onSubmit={createForm.handleSubmit(onCreateSubmit)}
                            className="space-y-8"
                        >
                            <div className="space-y-8 px-6">
                                <div className="flex items-center justify-center text-center">
                                    <FormField
                                        control={createForm.control}
                                        name="imageUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <FileUpload
                                                        endpoint="imageUploader"
                                                        value={field.value}
                                                        onChange={
                                                            field.onChange
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={createForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="uppercase text-xs font-bold text-muted-foreground">
                                                Server name
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    disabled={loading}
                                                    className="bg-secondary/50 border-0 focus-visible:ring-0 text-foreground focus-visible:ring-offset-0"
                                                    placeholder="Enter server name"
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
                                    {loading ? <Spinner /> : "Create"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                ) : (
                    <Form {...joinForm}>
                        <form
                            onSubmit={joinForm.handleSubmit(onJoinSubmit)}
                            className="space-y-8"
                        >
                            <div className="space-y-8 px-6">
                                <FormField
                                    control={joinForm.control}
                                    name="inviteCode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="uppercase text-xs font-bold text-muted-foreground">
                                                Invite code
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    disabled={loading}
                                                    className="bg-secondary/50 border-0 focus-visible:ring-0 text-foreground focus-visible:ring-offset-0"
                                                    placeholder="Enter invite code"
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
                                    {loading ? <Spinner /> : "Join"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateServerModal;
