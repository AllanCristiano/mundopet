package br.com.mundopet.beauty.internal;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.concurrent.RejectedExecutionException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import br.com.mundopet.shared.DependencyUnavailableException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

/**
 * Valida e reprocessa a foto enviada pela clinica:
 * - so aceita JPEG/PNG de verdade (confere a assinatura do arquivo, nao o content-type informado);
 * - recusa imagens gigantes antes de decodificar (protecao contra "bomba de descompressao");
 * - gera uma versao grande (ate 1600 px) e uma miniatura (ate 600 px) em JPEG;
 * - re-codificar REMOVE os metadados (EXIF com localizacao GPS do celular, modelo, etc.).
 * O trabalho de CPU roda num pool proprio e pequeno, fora do event loop, com fila limitada.
 */
@Component
class ImageProcessor implements DisposableBean {

    static final int MAX_BYTES = 5 * 1024 * 1024;
    static final long MAX_PIXELS = 40_000_000L;
    static final int MIN_SIDE = 200;
    static final int FULL_SIDE = 1600;
    static final int THUMB_SIDE = 600;

    record Processed(byte[] full, byte[] thumb, int width, int height) {
    }

    private final Scheduler scheduler = Schedulers.newBoundedElastic(2, 8, "beauty-img");

    Mono<Processed> process(byte[] data) {
        return Mono.fromCallable(() -> processSync(data))
                .subscribeOn(scheduler)
                .onErrorMap(RejectedExecutionException.class, ex -> new DependencyUnavailableException("Processamento de imagens", ex));
    }

    static Processed processSync(byte[] data) {
        if (data == null || data.length == 0) {
            throw new IllegalArgumentException("Envie uma foto");
        }
        if (data.length > MAX_BYTES) {
            throw new IllegalArgumentException("Foto muito grande (máximo 5 MB)");
        }
        if (!isJpeg(data) && !isPng(data)) {
            throw new IllegalArgumentException("Formato não suportado: envie uma foto JPG ou PNG");
        }
        BufferedImage source = decode(data);
        BufferedImage full = scale(source, FULL_SIDE);
        return new Processed(encodeJpeg(full, 0.86f), encodeJpeg(scale(source, THUMB_SIDE), 0.8f), full.getWidth(), full.getHeight());
    }

    static boolean isJpeg(byte[] d) {
        return d.length > 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF;
    }

    static boolean isPng(byte[] d) {
        return d.length > 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G';
    }

    private static BufferedImage decode(byte[] data) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new IllegalArgumentException("Não foi possível ler a imagem");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                // so le o cabecalho: decide antes de alocar memoria para os pixels
                long w = reader.getWidth(0);
                long h = reader.getHeight(0);
                if (w * h > MAX_PIXELS) {
                    throw new IllegalArgumentException("Imagem com resolução grande demais");
                }
                if (w < MIN_SIDE || h < MIN_SIDE) {
                    throw new IllegalArgumentException("Imagem pequena demais (mínimo " + MIN_SIDE + " px)");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof IllegalArgumentException iae) {
                throw iae;
            }
            throw new IllegalArgumentException("Imagem corrompida ou não suportada", e);
        }
    }

    /** Reduz (nunca amplia) para caber em maxSide, com fundo branco para PNG transparente. */
    static BufferedImage scale(BufferedImage src, int maxSide) {
        double factor = Math.min(1.0, (double) maxSide / Math.max(src.getWidth(), src.getHeight()));
        int w = Math.max(1, (int) Math.round(src.getWidth() * factor));
        int h = Math.max(1, (int) Math.round(src.getHeight() * factor));
        BufferedImage current = src;
        // reducao em etapas (metade por vez) fica bem mais nitida que um unico passo
        while (current.getWidth() / 2 >= w && current.getHeight() / 2 >= h) {
            current = draw(current, current.getWidth() / 2, current.getHeight() / 2);
        }
        return draw(current, w, h);
    }

    private static BufferedImage draw(BufferedImage src, int w, int h) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    static byte[] encodeJpeg(BufferedImage img, float quality) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(quality);
            param.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);
            writer.write(null, new IIOImage(img, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao gerar JPEG", e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    @Override
    public void destroy() {
        scheduler.dispose();
    }
}
